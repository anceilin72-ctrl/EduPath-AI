/**
 * projectAnalyzer.js — EduPath 2.0 Phase 6
 *
 * AI-assisted project analyzer:
 * 1. Inspects project details (name, description, technologies, role).
 * 2. Detects catalog skills & confidence levels.
 * 3. Confirms selected skills as PROJECT evidence in Skill Passport & promotes to User.profile.knownNodeKeys.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import SkillEvidence from '../models/SkillEvidence.js';
import User from '../models/User.js';
import { loadCatalogIndex } from './roadmapService.js';
import ApiError from '../utils/ApiError.js';

export async function analyzeProjectDetails({ name, description = '', technologies = '', role = '' }) {
  const index = await loadCatalogIndex();
  const catalogNodes = Array.from(index.values());

  const fullText = `${name} ${description} ${technologies} ${role}`.toLowerCase();
  const detected = [];

  for (const node of catalogNodes) {
    const keyMatch = fullText.includes(node.key.toLowerCase());
    const titleMatch = fullText.includes(node.title.toLowerCase());
    const aliasMatch = (node.aliases || []).some((a) => fullText.includes(a.toLowerCase()));

    if (keyMatch || titleMatch || aliasMatch) {
      let evidenceText = `Used ${node.title} in project "${name}".`;
      if (role && role.trim()) {
        evidenceText = `${role}: Applied ${node.title} in project "${name}".`;
      } else if (description && description.trim()) {
        evidenceText = `Demonstrated ${node.title} in "${name}": ${description.slice(0, 100)}...`;
      }

      detected.push({
        skillId: node.key,
        skillTitle: node.title,
        evidenceText,
        confidence: keyMatch || titleMatch ? 'High' : 'Medium',
        sourceType: 'PROJECT',
        matchedText: titleMatch ? node.title : node.key,
      });
    }
  }

  // AI refinement if Gemini key present
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim() !== '' && apiKey !== 'obviously-not-a-real-key') {
    try {
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });
      const prompt = `Analyze this software project for demonstrated technical skills, programming languages, frameworks, libraries, databases, APIs, AI/ML concepts, architecture, and devops concepts:
Project Name: ${name}
Description: ${description}
Tech Stack: ${technologies}
Role: ${role}

Available catalog skills: ${JSON.stringify(catalogNodes.map((n) => ({ key: n.key, title: n.title })))}

Return a JSON array of objects:
[{ "skillId": "node-key", "skillTitle": "Title", "evidenceText": "Specific evidence quote describing how it was used", "confidence": "High"|"Medium" }]`;

      const response = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 4000)),
      ]);
      const parsed = JSON.parse(response?.response?.text() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((item) => index.has(item.skillId))
          .map((item) => ({
            ...item,
            sourceType: 'PROJECT',
            evidenceText: item.evidenceText || `Used ${item.skillTitle} in ${name}.`,
          }));
      }
    } catch (err) {
      // Fallback to static matching
    }
  }

  return detected;
}

export async function confirmProjectEvidence({ userId, projectName, projectUrl = '', detectedNodeKeys = [], items = [], autoConfirm = true }) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');

  const createdEvidences = [];
  const confirmedKeys = new Set(user.profile?.knownNodeKeys || []);

  const customTextMap = new Map();
  for (const it of items) {
    if (it.skillId && it.evidenceText) {
      customTextMap.set(it.skillId, it.evidenceText);
    }
  }

  for (const skillId of detectedNodeKeys) {
    confirmedKeys.add(skillId);

    const sourceId = `proj-${projectName.toLowerCase().trim().replace(/[\s_]+/g, '-')}-${skillId.toLowerCase()}`;
    const customText = customTextMap.get(skillId);
    const evidenceText = customText || `Demonstrated in project "${projectName}". ${projectUrl ? `URL: ${projectUrl}` : ''}`;

    const evidence = await SkillEvidence.findOneAndUpdate(
      { userId, skillId, sourceType: 'PROJECT', sourceId },
      {
        $set: {
          evidenceText,
          confidence: 'High',
          verificationStatus: autoConfirm ? 'USER_CONFIRMED' : 'UNVERIFIED',
          skillLevel: 'intermediate',
          metadata: { projectName, projectUrl },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    createdEvidences.push(evidence);
  }

  user.profile.knownNodeKeys = Array.from(confirmedKeys);
  await user.save();

  return {
    count: createdEvidences.length,
    evidences: createdEvidences,
    updatedKnownSkillCount: user.profile.knownNodeKeys.length,
  };
}
