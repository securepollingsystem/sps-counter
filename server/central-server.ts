'use strict';

import { sql } from 'slonik';

//cs is the comment for things we should probably delete now that this is central-server.ts
//cs let lastUpdateOpinionCounts = Date.now(); // when's the last time we checked updated_at in all opinions
//cs let lastStoreScreed = lastUpdateOpinionCounts + 1000; // when's the last time we stored a new/updated screed

export async function storeScreed(pool, signedScreedObject) {
//cs   lastStoreScreed = Date.now(); // update time when this last happened
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
    const sqlline = sql.unsafe`SELECT id FROM sps.opinions WHERE opinion = ${opinionText}`; //  using sql.unsafe with ${} placeholders is safe. The name exists to make developers aware they're using a lower-level API, but injection protection remains intact
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

async function sqlGetCount(pool, sqlCountQuery) {
  const count_obj = await pool.any(sqlCountQuery);
  return count_obj[0].count.toString();
};

export function setupCentralServer(app, pool, logAccess) {
  console.log("setting up /screeds-since");
  app.get('/screeds-since', async (req, res) => {
    let screeds = 'unpopulated';
    let sqlString = 'unpopulated';
    if ( req.query.timestamp && /^\d+$/.test(req.query.timestamp) ) { // should be a number
      // sps.screeds (pubkey, signer_key, sig_expires, modified)
      const search_value = decodeURIComponent(req.query.timestamp)
      //                     SELECT * FROM sps.screeds WHERE modified > TO_TIMESTAMP(1767225600);  returns since 1/1/2026
      sqlString = sql.unsafe`SELECT * FROM sps.screeds WHERE modified > TO_TIMESTAMP(${search_value})`;
      screeds = await pool.any(sqlString);
      logAccess(req,'Safe screeds-since query: '+sqlString.values+' returned this many items: '+screeds.length);
    } else {
      screeds = await pool.any(sql.unsafe`SELECT * FROM sps.screeds`);
      logAccess(req,'no timestamp, returned this many items: '+screeds.length);
    }
    res.setHeader('Content-Type', 'application/json'); // https://stackoverflow.com/questions/19696240/proper-way-to-return-json-using-node-or-express
    res.json(screeds);
  });
}
