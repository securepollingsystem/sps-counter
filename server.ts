import express from 'express';
import { createPool, sql } from 'slonik';
import fs from 'fs';
import cors from 'cors';
import { verifyScreedSignature } from 'sps-common';
import YAML from 'yaml';

async function getConfig(filePath) {
  const fileContent = fs.readFileSync(filePath, {encoding: 'utf8'});
  const config = YAML.parse(fileContent);
  return config;
}

var logFileName = 'sps-counter.log';
var allowedOrigins = []; // URLs that are allowed to connect here
var blockList = []; // IP addresses or prefixes that we simply ignore

getConfig('./sps-demo.yaml').then(config => {
  console.log(config);
  if (Object.hasOwn(config, 'logfile')) {
    logFileName = config.logfile;
    console.log('logFileName',logFileName);
  };
  if (Object.hasOwn(config, 'allowedorigins')) {
    allowedOrigins = config.allowedorigins;
    console.log('allowedOrigins',allowedOrigins);
  };
  if (Object.hasOwn(config, 'blocklist')) {
    blockList = config.blocklist;
    console.log('blockList',blockList);
  };
}).catch(err => {
  console.error('Error reading config:', err);
});


var logFileLastLine = ''; // we will try to read the last line of the logfile
try {
  logFileLastLine = fs.readFileSync(logFileName, {encoding: 'utf8'})
    .split(/\r?\n/).filter(i => i !== '').at(-1);
} catch (err) {
  console.log('Unable to find logfile', logFileName, ', this is normal the first time this server runs');
}

var totalUptimeFromLogFile = parseFloat(logFileLastLine.split(' ')[7],10);
if (isNaN(totalUptimeFromLogFile)) {
  console.log('last line of logfile didn\'t contain total uptime, assuming 0.0');
  totalUptimeFromLogFile = 0.0;
}
console.log('total uptime from log file:',totalUptimeFromLogFile);

let logFile;
try {
  logFile = fs.createWriteStream(logFileName, { flags: 'a' }); // open logfile stream for append
} catch (err) {
  console.log('Unable to write to logfile', logFileName, ', perhaps I don\'t have permission');
  console.log('Shutting down...');
  process.exit(1); // exit with error code 1
}

var logLevel = 2; // how much info to put in the log file
var startTime = Date.now(); // store the time this program starts
var searchesToday = 0; // how many queries have come in

var lastUpdateOpinionCounts = Date.now(); // when's the last time we checked updated_at in all opinions
var lastStoreScreed = lastUpdateOpinionCounts + 1000; // when's the last time we stored a new/updated screed

// file full of URLs that are allowed to load from this API, such as http://localhost:8990

const postGresURI = fs.readFileSync('postgres.uri', {encoding: 'utf8'});
// postgresql://user:password@localhost:5432/spsdata
// postgresql://[user[:password]@][host[:port]][/database name][?name=value[&...]]

const main = async () => {
  const pool = await createPool(postGresURI);

  const app = express();
  const port = 8994;

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('origin:',origin);
        callback(new Error('disallowed by cors'));
      }
    },
    credentials: true
  }));

  app.use(async (req, res, next) => {
    const ip = logAccess(req,'');
    var scanner = 0;
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

  app.get('/opinions', async (req, res) => {
    searchesToday += 1; // increment the count of searches today
    var opinions = 'unpopulated';
    var sqlString = 'unpopulated';
    if ( req.query.subset ) { // '?subset=' returns false here
      const search_value = '%' + decodeURIComponent(req.query.subset) + '%'
      sqlString = sql.unsafe`SELECT * FROM sps.opinions WHERE OPINION ILIKE ${search_value} ORDER BY screed_count DESC`;
      opinions = await pool.any(sqlString);
      logAccess(req,'Safe subset query: '+sqlString.values+' returned this many items: '+opinions.length);
    } else {
      opinions = await pool.any(sql.unsafe`SELECT * FROM sps.opinions ORDER BY screed_count DESC`);
      logAccess(req,'no subset, returned this many items: '+opinions.length);
    }
    const stringResponse = JSON.stringify(opinions); // , (key, value) => typeof value === 'bigint' ? value.toString() : value);  // https://github.com/GoogleChromeLabs/jsbi/issues/30
    res.setHeader('Content-Type', 'application/json'); // https://stackoverflow.com/questions/19696240/proper-way-to-return-json-using-node-or-express
    res.json(opinions);
  });

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
    let rawData = req.body;
    let encoding = req.headers['content-encoding'];
    let dataBuffer;
    if (encoding === 'gzip') {
      const { gunzipSync } = await import('zlib');
      try {
        dataBuffer = gunzipSync(rawData);
        logAccess(req, 'Received gzip upload');
      } catch (err) {
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
          await storeScreed(dataBuffer);
          lastStoreScreed = Date.now(); // update time when this last happened
        } else {
          console.log('verifyScreedSignature failed:', screedIsSigned);
        }
      }
    }
    res.json({ status: 'success', bytesReceived: dataBuffer.length });
  });

  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  });

  async function storeScreed(signedScreedObject) {
    const sqlString = sql.unsafe`
      INSERT INTO sps.screeds (pubkey, signer_key, sig_expires, modified)
      VALUES (
        ${signedScreedObject.publicKey},
        ${'signer_key'},
        TO_TIMESTAMP(${1758394589}),
        NOW()
      )
      ON CONFLICT (pubkey)
      DO UPDATE SET modified = NOW()
    `; // EXCLUDED.signer_key means the value that was attempted to be inserted into signer_key
    const response = await pool.any(sqlString);

    // Delete any existing screedlines for this screed_key and then we will repopulate them
    await pool.any(sql.unsafe`DELETE FROM sps.screedlines WHERE screed_key = ${signedScreedObject.publicKey}`);

    // For each item in signedScreedObject.screed, check if opinion exists and if not, insert it.  Grab its id.
    for (const opinionText of JSON.parse(signedScreedObject.screed)) {
      if (typeof opinionText !== 'string' || !opinionText.trim()) {
        console.log('Skipping invalid opinion type:', typeof(opinionText), 'value:', opinionText);
        continue;
      }
      const sqlline = sql.unsafe`SELECT id FROM sps.opinions WHERE opinion = ${opinionText}`;
      // console.log('opinionText:',opinionText,'sqlline:', sqlline.text, sqlline.values);
      let opinionRow = await pool.maybeOne(sqlline);
      let opinionId;
      if (!opinionRow) {
        const insertResult = await pool.one(sql.unsafe`INSERT INTO sps.opinions (opinion, screed_count) VALUES (${opinionText}, 1) RETURNING id`);
        if (!insertResult || !insertResult.id) {
          console.error('Failed to insert opinion:', opinionText, 'insertResult:', insertResult);
          continue;
        }
        opinionId = insertResult.id;
      } else {
        opinionId = opinionRow.id;
      }
      //console.log('Inserting into screedlines:', { screed_key: signedScreedObject.publicKey, opinion_id: opinionId });
      await pool.any(sql.unsafe`INSERT INTO sps.screedlines (screed_key, opinion_id) VALUES (${signedScreedObject.publicKey}, ${opinionId})`);
    }
    return response;
  };

  async function maybeUpdateOpinionCounts() { // run updateOpinionCounts if needed
    if (lastUpdateOpinionCounts < lastStoreScreed) { // compare the last time updateOpinionCounts ran to the most recent storeScreed time
      const newestScreedTimeObj = await pool.any(sql.unsafe`SELECT MAX(modified) FROM sps.screeds`); // get timestamp of newest record in sps.screeds modified
      const newestScreedTime = newestScreedTimeObj[0].max; // just the unixtime value (in milliseconds)
      const opinionsToUpdate = await pool.any(sql.unsafe`SELECT id FROM sps.opinions WHERE updated_at < TO_TIMESTAMP(${newestScreedTime})`); // find out if any sps.opinions were updated_at older value than newest screed
      if (opinionsToUpdate.length > 0) { // if there are opinions that needs to be updated
        updateOpinionCounts(opinionsToUpdate);
      }
    }
  };

  function updateOpinionCounts(opinionsToUpdate) {
    lastUpdateOpinionCounts = Date.now(); // record when this last happened
    opinionsToUpdate.map(async (opinion) => { // get a list of ids in sps.opinions and run a for loop (map) on that
      const screedCount = await sqlGetCount(sql.unsafe`SELECT COUNT(*) FROM sps.screedlines WHERE opinion_id = ${opinion.id}`); // how many screeds hold this opinion
      await pool.any(sql.unsafe`UPDATE sps.opinions SET screed_count = ${screedCount}, updated_at = NOW() WHERE id = ${opinion.id}`); // set screed_count and updated_at
    })
    const logLine = `${Date().slice(0,24)} updateOpinionCounts`;
    console.log(logLine);
  }

  const maybeUpdater = setInterval(maybeUpdateOpinionCounts, 1000);
};

function logAccess(req, addlInfo) {
  //const ip = req.ip; // https://stackoverflow.com/questions/29411551/express-js-req-ip-is-returning-ffff127-0-0-1
  var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress; // https://stackoverflow.com/a/39473073
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
