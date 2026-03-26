'use strict';

import { sql } from 'slonik';

export async function storeScreed(pool, signedScreedObject) {
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
    const opinionRow = await pool.maybeOne(sqlline);
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
    await pool.any(sql.unsafe`INSERT INTO sps.screedlines (screed_key, opinion_id) VALUES (${signedScreedObject.publicKey}, ${opinionId})`);
  }
  return response;
};

export async function maybeUpdateOpinionCounts(pool, lastUpdateOpinionCounts, lastStoreScreed) { // run updateOpinionCounts if needed
  if (lastUpdateOpinionCounts < lastStoreScreed) { // compare the last time updateOpinionCounts ran to the most recent storeScreed time
    const newestScreedTimeObj = await pool.any(sql.unsafe`SELECT MAX(modified) FROM sps.screeds`); // get timestamp of newest record in sps.screeds modified
    const newestScreedTime = newestScreedTimeObj[0].max; // just the unixtime value (in milliseconds)
    const opinionsToUpdate = await pool.any(sql.unsafe`SELECT id FROM sps.opinions WHERE updated_at < TO_TIMESTAMP(${newestScreedTime})`); // find out if any sps.opinions were updated_at older value than newest screed
    if (opinionsToUpdate.length > 0) { // if there are opinions that needs to be updated
      updateOpinionCounts(pool, opinionsToUpdate);
      return Date.now();
    }
  }
  return lastUpdateOpinionCounts;
};

export function updateOpinionCounts(pool, opinionsToUpdate) {
  opinionsToUpdate.map(async (opinion) => { // get a list of ids in sps.opinions and run a for loop (map) on that
    const screedCount = await sqlGetCount(pool, sql.unsafe`SELECT COUNT(*) FROM sps.screedlines WHERE opinion_id = ${opinion.id}`); // how many screeds hold this opinion
    await pool.any(sql.unsafe`UPDATE sps.opinions SET screed_count = ${screedCount}, updated_at = NOW() WHERE id = ${opinion.id}`); // set screed_count and updated_at
  })
  const logLine = `${Date().slice(0,24)} updateOpinionCounts`;
  console.log(logLine);
}

async function sqlGetCount(pool, sqlCountQuery) {
  const count_obj = await pool.any(sqlCountQuery);
  return count_obj[0].count.toString();
};

export function setupOpinionsRoute(app, pool, logAccess) {
  app.get('/opinions', async (req, res) => {
    let opinions = 'unpopulated';
    let sqlString = 'unpopulated';
    if ( req.query.subset ) { // '?subset=' returns false here
      const search_value = '%' + decodeURIComponent(req.query.subset) + '%'
      sqlString = sql.unsafe`SELECT * FROM sps.opinions WHERE OPINION ILIKE ${search_value} ORDER BY screed_count DESC`;
      opinions = await pool.any(sqlString);
      logAccess(req,'Safe subset query: '+sqlString.values+' returned this many items: '+opinions.length);
    } else {
      opinions = await pool.any(sql.unsafe`SELECT * FROM sps.opinions ORDER BY screed_count DESC`);
      logAccess(req,'no subset, returned this many items: '+opinions.length);
    }
    res.setHeader('Content-Type', 'application/json'); // https://stackoverflow.com/questions/19696240/proper-way-to-return-json-using-node-or-express
    res.json(opinions);
  });
}
