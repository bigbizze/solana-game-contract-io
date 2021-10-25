import readline from "readline";
import db_conn from "./index";


const created_updated = `
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
`.trim();

const dbMatch = `
CREATE TABLE IF NOT EXISTS solana.match (
  matchPubKey VARCHAR(60) NOT NULL,
  secretKey VARCHAR(100) NOT NULL,
  ${created_updated},
  PRIMARY KEY (matchPubKey)
);`;

const dbUser = `
CREATE TABLE IF NOT EXISTS solana.user (
  id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  matchPubKey VARCHAR(60) NOT NULL,
  userPubKey VARCHAR(60) NOT NULL,
  userTokenPubKey VARCHAR(60) NOT NULL,
  userMatchTokenPubKey VARCHAR(60) NOT NULL,
  ${created_updated},
  PRIMARY KEY (id),
  FOREIGN KEY(matchPubKey) REFERENCES solana.match(matchPubKey)
);`;

const create_table_queries = [
  dbMatch,
  dbUser
];

const line_reader = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const build_db = async () => {
  let conn = await db_conn();
  try {
    for (let table_query of create_table_queries) {
      await conn.query(table_query);
    }
    await conn.end();
  } catch (e) {
    console.log(e);
    await conn.end();
    throw e;
  } finally {
    await conn.end();
    process.exit(0);
  }
};

if (require.main === module) {
  line_reader.question(`This will create if not exists all tables in the database, are you sure? [Yes/No]: `, (answer: string) => {
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      build_db().catch(err => {
        console.log(err);
      });
    }
  });
}
