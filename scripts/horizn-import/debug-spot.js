const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Check spots near Place Saint Pierre coordinates from Horizn data
const horiznData = JSON.parse(fs.readFileSync('./data/horizn-spots-output.json', 'utf8'));
const stPierre = horiznData.find(s => s.name && s.name.includes('Saint Pierre'));

console.log('Horizn spot:', stPierre.name);
console.log('Coordinates:', stPierre.latitude, stPierre.longitude);

const latRange = 0.01;
const lngRange = 0.01;

db.collection('spots')
  .where('location', '>=', new admin.firestore.GeoPoint(stPierre.latitude - latRange, stPierre.longitude - lngRange))
  .where('location', '<=', new admin.firestore.GeoPoint(stPierre.latitude + latRange, stPierre.longitude + lngRange))
  .get()
  .then(snapshot => {
    console.log('\nFound', snapshot.size, 'nearby spots:');
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log('\n---');
      console.log('ID:', doc.id);
      console.log('Name:', JSON.stringify(data.name));
      console.log('Location:', data.location.latitude, data.location.longitude);
      
      // Calculate distance
      const R = 6371e3;
      const φ1 = stPierre.latitude * Math.PI / 180;
      const φ2 = data.location.latitude * Math.PI / 180;
      const Δφ = (data.location.latitude - stPierre.latitude) * Math.PI / 180;
      const Δλ = (data.location.longitude - stPierre.longitude) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      console.log('Distance:', Math.round(distance), 'm');
    });
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
