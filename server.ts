'use strict';
import express from 'express';
import { createPool, sql } from 'slonik';
import fs from 'fs';
import cors from 'cors';
import { verifyScreedSignature } from 'sps-common';
import { loadConfig } from './server/config';
import { setupOpinionsRoute, storeScreed, maybeUpdateOpinionCounts } from './server/counter';

let configFileName = process.env.SPS_CONFIG_FILE; // check environment for SPS_CONFIG_FILE
if (configFileName === undefined) {
  configFileName = import.meta.url.replace('file://','') + '.yaml'; // default config filename is this file .yaml
}

const { serverFunction, logFileName, allowedOrigins, blockList, serverPort, postGresURI } = await loadConfig(configFileName);

if (serverFunction === 'central-server') {
  console.log('serverFunction === central-server');
} else if (serverFunction === 'counter') {
  console.log('serverFunction === counter');
} else {
  console.error('Error: serverFunction must be "central-server" or "counter", got ', typeof(serverFunction), serverFunction);
  process.exit(1); // exit with error code 9
}

// TODO: use postgres to store our uptime
// TODO: use log4js instead of this
let logFileLastLine = ''; // we will try to read the last line of the logfile
try {
  logFileLastLine = fs.readFileSync(logFileName, {encoding: 'utf8'})
    .split(/\r?\n/).filter(i => i !== '').at(-1);
} catch (err) {
  console.error("Error occurred:", err.message);
  console.log('Unable to find logfile', logFileName, ', this is normal the first time this server runs');
}

let totalUptimeFromLogFile = parseFloat(logFileLastLine.split(' ')[7],10);
if (isNaN(totalUptimeFromLogFile)) {
  console.log('last line of logfile didn\'t contain total uptime, assuming 0.0');
  totalUptimeFromLogFile = 0.0;
}
console.log('total uptime from log file:',totalUptimeFromLogFile);

let logFile;
try {
  logFile = fs.createWriteStream(logFileName, { flags: 'a' }); // open logfile stream for append
} catch (err) {
  console.error("Error occurred:", err.message);
  console.log('Unable to write to logfile', logFileName, ', perhaps I don\'t have permission');
  console.log('Shutting down...');
  process.exit(1); // exit with error code 1
}

const logLevel = 2; // how much info to put in the log file
const startTime = Date.now(); // store the time this program starts
let searchesToday = 0; // how many queries have come in

let lastUpdateOpinionCounts = Date.now(); // when's the last time we checked updated_at in all opinions
let lastStoreScreed = lastUpdateOpinionCounts + 1000; // when's the last time we stored a new/updated screed

const main = async () => {
  let pool;
  try {
    pool = await createPool(postGresURI);
  } catch (err) {
    console.error("Error occurred:", err.message);
    console.log('Unable to connect to postgres using URI', postGresURI.replace(/postgresql:\/\/.*@/,'postgresql://[user]:[password]@'), ', perhaps I don\'t have permission');
    console.log('Shutting down...');
    process.exit(2); // exit with error code 2
  }

  const app = express();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('origin:',origin);
        callback(new Error('server.ts: disallowed by cors'));
      }
    },
    credentials: true
  }));

  app.use(async (req, res, next) => {
    const ip = logAccess(req,'');
    let scanner = 0;
    await Promise.all(blockList
      .filter(d => ip.match(d) != null)
      .map(async function (d) {
        if (ip.match(d)['index'] == 0) {
          scanner += 1;
        }
      }));
    if (scanner == 0) {
      return next();
    }; // otherwise just ignore them
  });

  app.use(express.static('dist')); // automatically routes / to index.html

  setupOpinionsRoute(app, pool, logAccess, { searchesToday });

  app.get('/ipv4', (req, res) => {
    console.log(req);
    return res.json({ message: `Hello! Your IP address is: ${logAccess(req,'')}` });
  });

  app.get('/info', async (req, res) => {
    // ask postgres how many screeds are stored, how many opinions, etc
    // check globals or logs for server activity stats to report
    return res.json({ "screeds stored"  : await sqlGetCount(sql.unsafe`SELECT COUNT(pubkey) FROM sps.screeds`),
                      "opinions held"   : await sqlGetCount(sql.unsafe`SELECT COUNT(screed_count) FROM sps.opinions WHERE screed_count > 0`),
                      "searches today"  : searchesToday,
                      "unique visitors today": `unique_visitors_today`,
                      "hours since server started" : uptimePresent().toFixed(1),
                      "total hours active"     : uptimeTotal().toFixed(1)
    });
  });

  async function sqlGetCount(sqlCountQuery) {
    const count_obj = await pool.any(sqlCountQuery);
    return count_obj[0].count.toString();
  };

  app.use(express.json()); // Add JSON body parsing middleware
  app.post('/upload-screed', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    const rawData = req.body;
    const encoding = req.headers['content-encoding'];
    let dataBuffer;
    if (encoding === 'gzip') {
      const { gunzipSync } = await import('zlib');
      try {
        dataBuffer = gunzipSync(rawData);
        logAccess(req, 'Received gzip upload');
      } catch (err) {
        console.error("Error occurred:", err.message);
        logAccess(req, 'Failed to decompress gzip upload');
        return res.status(400).json({ error: 'Invalid gzip data' });
      }
    } else {
      dataBuffer = rawData;
      logAccess(req, 'Received raw upload');
    }
    if (Buffer.isBuffer(dataBuffer)) {
      console.log('ERROR: upload-screed (buffer):', dataBuffer.toString());
    } else {
      console.log('upload-screed (non-buffer):', typeof dataBuffer, JSON.stringify(dataBuffer));
      if (typeof dataBuffer === 'object' && dataBuffer !== null) {
        const screedIsSigned = await verifyScreedSignature(dataBuffer);
        if (screedIsSigned) {
          console.log('verifyScreedSignature:',screedIsSigned);
          await storeScreed(pool, dataBuffer);
          lastStoreScreed = Date.now(); // update time when this last happened
        } else {
          console.log('verifyScreedSignature failed:', screedIsSigned);
        }
      }
    }
    res.json({ status: 'success', bytesReceived: dataBuffer.length });
  });

  app.listen(serverPort, () => {
    console.log(`Example app listening on port ${serverPort}`)
  });

  setInterval(async () => { lastUpdateOpinionCounts = await maybeUpdateOpinionCounts(pool, lastUpdateOpinionCounts, lastStoreScreed); }, 1000);
};

function logAccess(req, addlInfo) {
  //const ip = req.ip; // https://stackoverflow.com/questions/29411551/express-js-req-ip-is-returning-ffff127-0-0-1
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // https://stackoverflow.com/a/39473073
  if (ip.substr(0, 7) == "::ffff:") {
    ip = ip.substr(7)
  }
  const logLine = `${Date().slice(0,24)} ${ip} asks for ${req.url} using ${req.headers['user-agent']} ${addlInfo}`;
  console.log(logLine);
  if (logLevel > 1) {
    logFile.write(logLine + '\n');
  }
  return ip;
}

function uptimePresent() {
  return ( Date.now() - startTime ) / 3600000.0;
}

function uptimeTotal() {
  return uptimePresent() + totalUptimeFromLogFile;
}

process.on('SIGINT', () => {
  console.log('Shutting down...');
  logFile.write('sps-server closed after ' + uptimePresent().toFixed(0) + ' hours, total uptime ' + uptimeTotal().toFixed(3) + ' hours\n');
  process.exit(0); // This allows Node to exit normally, restoring terminal state
});

main();
