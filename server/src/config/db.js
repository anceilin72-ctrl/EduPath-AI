import mongoose from 'mongoose';

/**
 * MongoDB connection.
 *
 * The database can be either a local MongoDB server or a hosted Atlas cluster —
 * the app does not care which, because Mongoose speaks the same protocol to
 * both. Only the URI in .env changes:
 *
 *   local   mongodb://127.0.0.1:27017/careerRoadmap
 *   Atlas   mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/careerRoadmap
 *
 * What follows is mostly error translation. A failed connection produces one of
 * a handful of causes, and the driver's own message names none of them: it says
 * "could not connect to any servers" whether the service is stopped, the
 * password is wrong, or a campus firewall is dropping port 27017. Guessing costs
 * a student an evening; being told costs them two minutes. So the causes are
 * separated here, and the local and hosted cases get different advice because
 * the fixes have nothing in common.
 */

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set.\n' +
        'Copy server/.env.example to server/.env and put your connection string in it.\n' +
        'For a local MongoDB server that is: mongodb://127.0.0.1:27017/careerRoadmap'
    );
  }

  // Fail fast rather than retrying silently for 30 seconds.
  mongoose.set('strictQuery', true);

  try {
    const connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    return connection;
  } catch (err) {
    throw new Error(`${explainConnectionError(err, uri)}\n\nOriginal driver error: ${err.message}`);
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

/**
 * A human-readable name for whatever the URI points at, safe to print.
 *
 * Never returns the credentials. Console output ends up in screenshots and in
 * submitted reports, and a password in a screenshot cannot be un-shared.
 */
export function describeTarget(uri = process.env.MONGODB_URI ?? '') {
  if (isLocal(uri)) {
    const port = uri.match(/:(\d{2,5})(?:[/?]|$)/)?.[1] ?? '27017';
    return `MongoDB on this machine (port ${port})`;
  }

  if (/mongodb(\+srv)?:\/\//.test(uri)) {
    const host = uri.match(/@([^/?,]+)/)?.[1];
    return host ? `MongoDB Atlas (${host})` : 'MongoDB Atlas';
  }

  return 'MongoDB';
}

/** True when the URI points at this machine rather than a hosted cluster. */
function isLocal(uri = '') {
  return /@?(127\.0\.0\.1|localhost|\[?::1\]?)(:|\/)/.test(uri) && !uri.startsWith('mongodb+srv://');
}

/**
 * Turn the driver's generic failure into the specific thing that is wrong.
 */
function explainConnectionError(err, uri = '') {
  const message = err?.message ?? '';

  // The driver's own "could not connect to any servers ... IP isn't whitelisted"
  // message names no cause and appears for every unreachable host, so match the
  // error's name too — that is where MongooseServerSelectionError actually lives.
  const haystack = `${err?.name ?? ''} ${message}`;

  if (/bad auth|Authentication failed/i.test(message)) {
    return isLocal(uri)
      ? 'The server rejected the username or password.\n' +
          '  - A default local MongoDB install has no user and needs no credentials.\n' +
          '  - Try exactly: mongodb://127.0.0.1:27017/careerRoadmap'
      : 'Atlas rejected the username or password.\n' +
          '  - Check the database user under Atlas > Database Access.\n' +
          '  - If your password contains @ : / ? # or %, it must be percent-encoded in the URI.';
  }

  // Nothing is listening. Locally that means the service is stopped, or the URI
  // resolved to IPv6 while MongoDB is listening on IPv4 only. Remotely it means
  // the connection was actively refused rather than merely dropped.
  if (/ECONNREFUSED/i.test(message)) {
    if (/::1/.test(message)) {
      return (
        'Nothing answered on the IPv6 loopback address.\n' +
        '  - Use 127.0.0.1 rather than localhost in MONGODB_URI. On Windows, "localhost"\n' +
        '    resolves to ::1 first, but MongoDB listens on IPv4 by default.'
      );
    }

    if (isLocal(uri)) {
      return (
        'Nothing is listening on that address, so the MongoDB server is probably not running.\n' +
        '  - Check it:  Get-Service MongoDB\n' +
        '  - Start it:  Start-Service MongoDB      (run PowerShell as Administrator)'
      );
    }

    return (
      'The remote server refused the connection.\n' +
      '  - Check the host and port in MONGODB_URI, and that the cluster still exists.\n' +
      '  - A network that blocks port 27017 usually times out rather than refusing, but a\n' +
      '    proxy or firewall can refuse outright. Test it with:\n' +
      '      Test-NetConnection <your-shard-host> -Port 27017'
    );
  }

  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(message)) {
    return (
      'The database hostname could not be looked up.\n' +
      '  - Check for a typo in the host part of MONGODB_URI.\n' +
      '  - If the error mentions querySrv, your network is refusing the SRV lookup that\n' +
      '    mongodb+srv:// depends on. This is common on college and hostel networks.\n' +
      '    SETUP.md has the long-form mongodb:// string that avoids the lookup entirely.'
    );
  }

  if (/timed out|ETIMEDOUT|ServerSelectionError|whitelist|could not connect to any servers|connection.*closed/i.test(haystack)) {
    return isLocal(uri)
      ? 'The local MongoDB server did not respond in time.\n' +
          '  - Check the service is running:  Get-Service MongoDB\n' +
          '  - If it is running, something else may be occupying port 27017.'
      : 'Could not reach the cluster before timing out. Two causes, in order of likelihood.\n' +
          '  1. The IP allowlist. Atlas > Network Access > Add IP Address. On a network that\n' +
          '     hands out a new address regularly, use 0.0.0.0/0 — development only.\n' +
          '  2. Your network is blocking outbound port 27017, which many campus and hostel\n' +
          '     networks do. Test it with:\n' +
          '       Test-NetConnection <your-shard-host> -Port 27017\n' +
          '     If that reports False, no connection string will get through. Run MongoDB\n' +
          '     locally instead — SETUP.md covers it — or use a phone hotspot.';
  }

  return isLocal(uri) ? 'Could not connect to the local MongoDB server.' : 'Could not connect to MongoDB Atlas.';
}

export default connectDB;
