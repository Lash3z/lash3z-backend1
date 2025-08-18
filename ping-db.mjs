import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
const db  = process.env.MONGO_DB || "lash3zDB";

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  await client.db(db).command({ ping: 1 });
  console.log(" Connected & ping ok to", db);
} catch (e) {
  console.error(" DB error:", e.message);
} finally {
  await client.close().catch(()=>{});
}
