/**
 * certificateAnalyzer.js — EduPath 2.0 Phase 6
 *
 * Certificate analyzer:
 * Extracts skills & topics from certificates, maps them to catalog keys,
 * and saves them as CERTIFICATE evidence (treated as evidence, not 100% proof of mastery).
 */

import SkillEvidence from '../models/SkillEvidence.js';
import User from '../models/User.js';
import { loadCatalogIndex } from './roadmapService.js';
import ApiError from '../utils/ApiError.js';

export async function analyzeCertificateDetails({ title, provider = '', topicsText = '', date = null, credentialType = 'Course Certificate' }) {
  const index = await loadCatalogIndex();
  const catalogNodes = Array.from(index.values());

  const fullText = `${title} ${provider} ${topicsText} ${credentialType}`.toLowerCase();
  const detected = [];

  for (const node of catalogNodes) {
    const keyMatch = fullText.includes(node.key.toLowerCase());
    const titleMatch = fullText.includes(node.title.toLowerCase());
    const aliasMatch = (node.aliases || []).some((a) => fullText.includes(a.toLowerCase()));

    if (keyMatch || titleMatch || aliasMatch) {
      detected.push({
        skillId: node.key,
        skillTitle: node.title,
        evidenceText: `Credential "${title}" from ${provider || 'issuer'} covering ${node.title}.`,
        confidence: 'Medium',
        sourceType: 'CERTIFICATE',
        estimatedLevel: 'intermediate',
      });
    }
  }

  // AI refinement if Gemini key present
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim() !== '' && apiKey !== 'obviously-not-a-real-key') {
    try {
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });
      const prompt = `Analyze this certificate for verified course skills and topics:
Certificate Title: ${title}
Provider/Issuer: ${provider}
Credential Type: ${credentialType}
Topics Covered: ${topicsText}

Catalog skills available: ${JSON.stringify(catalogNodes.map((n) => ({ key: n.key, title: n.title })))}

Return a JSON array of objects:
[{ "skillId": "node-key", "skillTitle": "Title", "evidenceText": "Evidence description", "confidence": "Medium" }]`;

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
            sourceType: 'CERTIFICATE',
            evidenceText: item.evidenceText || `Completed ${title} (${provider}) covering ${item.skillTitle}.`,
          }));
      }
    } catch {
      // Fallback to static matching
    }
  }

  return detected;
}

export async function confirmCertificateEvidence({
  userId,
  title,
  provider = '',
  date = null,
  credentialType = 'Course Certificate',
  credentialId = '',
  detectedNodeKeys = [],
  items = [],
}) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');

  const createdEvidences = [];
  const customTextMap = new Map();
  for (const it of items) {
    if (it.skillId && it.evidenceText) {
      customTextMap.set(it.skillId, it.evidenceText);
    }
  }

  for (const skillId of detectedNodeKeys) {
    const sourceId = `cert-${title.toLowerCase().trim().replace(/[\s_]+/g, '-')}-${skillId.toLowerCase()}`;
    const customText = customTextMap.get(skillId);
    const evidenceText = customText || `Completed certification "${title}" from ${provider || 'issuer'}.`;

    const evidence = await SkillEvidence.findOneAndUpdate(
      { userId, skillId, sourceType: 'CERTIFICATE', sourceId },
      {
        $set: {
          evidenceText,
          confidence: 'Medium',
          verificationStatus: 'USER_CONFIRMED',
          skillLevel: 'intermediate',
          metadata: { certificateTitle: title, provider, date, credentialType, credentialId },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    createdEvidences.push(evidence);
  }

  return {
    count: createdEvidences.length,
    evidences: createdEvidences,
  };
}
