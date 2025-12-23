import fs from 'fs';
import YAML from 'yaml';

async function readConfig(configObj: object, varName: string, defaultVal: string);
async function readConfig(configObj: object, varName: string, defaultVal: number);
async function readConfig(configObj: object, varName: string, defaultVal: object) {
  const objVarName = Object.keys(configObj || {}).find(key => key.toLowerCase() === varName.toLowerCase());
  const configVal = objVarName ? configObj[objVarName] : undefined;
  if (typeof(defaultVal) === typeof(configVal)) {
    return configVal;
  } else {
    console.log('didnt find',varName,'using default',defaultVal);
    return defaultVal;
  }
}

export async function loadConfig(configFileName) {
  let config: object = {};
  try {
    config = YAML.parse(fs.readFileSync(configFileName, {encoding: 'utf8'}));
  } catch (err) {
    console.error('Error reading config file ' + configFileName, err);
  }

  const logFileName = await readConfig(config, 'logfile', 'sps-counter.log');
  const allowedOrigins = await readConfig(config, 'allowedOrigins', []); // URLs that are allowed to connect here
  const blockList = await readConfig(config, 'blockList', []); // IP addresses or prefixes that we simply ignore
  const serverPort = await readConfig(config, 'serverPort', 8994); // port on which this server listens (default 8994)
  let postGresURI = await readConfig(config, 'postGresURI', 'nopostgresuri'); // postgresql://[user[:password]@][host[:port]][/database name][?name=value[&...]]
  if (postGresURI === 'nopostgresuri') {
    const postgresconfig = await readConfig(config, 'postgres', []);
    if (postgresconfig == []) {
      console.log('postgres URI is not defined in configuration file')
      process.exit(9);
    }
    postGresURI = 'postgresql://'
          + await readConfig(postgresconfig, 'user', 'postgres') + ':'
          + await readConfig(postgresconfig, 'password', 'postgres') + '@'
          + await readConfig(postgresconfig, 'address', 'localhost') + ':'
          + await readConfig(postgresconfig, 'port', 5432) + '/'
          + await readConfig(postgresconfig, 'database', 'postgres');
  }

  return { config, logFileName, allowedOrigins, blockList, serverPort, postGresURI };
}
