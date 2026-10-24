import https from 'https';

const url = process.env.HEALTH_URL || 'https://cart-gain.com/api/health';
https.get(url, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log(JSON.stringify(j, null, 2));
    } catch(e) {
      console.log(data);
    }
  });
}).on('error', (e) => {
  console.error('ERR', e.message);
});
