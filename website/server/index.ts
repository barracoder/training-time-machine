import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 5178);
const app = createApp();

app.listen(port, () => {
  console.log(`Strava Time Machine API listening on http://localhost:${port}`);
});
