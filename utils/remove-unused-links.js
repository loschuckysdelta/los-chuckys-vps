require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const deadline = setTimeout(() => {
  console.error('MongoDB timeout');
  process.exit(1);
}, 15000);

async function run() {
  await mongoose.connect(process.env.MONGO_DB, { serverSelectionTimeoutMS: 5000 });
  for (const name of ['collections', 'assets']) {
    const collection = mongoose.connection.collection(name);
    const result = await collection.updateMany({ link: { $exists: true } }, { $unset: { link: '' } });
    console.log(
      `${name}: ${result.modifiedCount} atributos link eliminados; restantes: ${await collection.countDocuments({ link: { $exists: true } })}`,
    );
  }
}

run()
  .catch((err) => {
    console.error(err.name);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    clearTimeout(deadline);
  });
