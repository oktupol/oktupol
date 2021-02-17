const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const puppeteer = require('puppeteer');

require('dotenv').config();

const clientId = process.env.STRAVA_API_CLIENT_ID;
const clientSecret = process.env.STRAVA_API_CLIENT_SECRET;
const refreshToken = process.env.STRAVA_API_REFRESH_TOKEN;
const oauthBaseUrl = process.env.STRAVA_OAUTH_BASE_URL;
const baseUrl = process.env.STRAVA_API_BASE_URL;

const thunderforestApiKey = process.env.THUNDERFOREST_API_KEY;

const assetsDirectory = `${process.cwd()}/assets`;

(async () => {
  const accessToken = await getAccessToken(refreshToken);
  const activityList = await listActivities(accessToken);

  const activitiesWithPhotos = activityList.filter(a => a.total_photo_count > 0);
  const activitiesWithoutPhotos = activityList.filter(a => a.total_photo_count === 0);

  const activitiesToConsider = [...activitiesWithPhotos, ...activitiesWithoutPhotos];

  if (fs.existsSync(assetsDirectory)) {
    fs.rmSync(assetsDirectory, { recursive: true });
  }

  let readmeTemplate = fs.readFileSync('./readme-template.md').toString();

  readmeTemplate += '<table>';

  const browser = await puppeteer.launch();
  for (let i = 0; i < Math.min(activitiesToConsider.length, 3); i++) {
    const activity = await getActivity(accessToken, activitiesToConsider[i].id);
    await createMap(browser, activity);
    const photo = await downloadActivityPhoto(activity);

    let typeEmoji = '';
    switch (activity.type) {
      case 'Ride':
        typeEmoji = '🚲 ';
        break;
      case 'Hike':
        typeEmoji = '🚶🏽‍♂️ ';
        break;
    }

    const activityDate = new Date(activity.start_date);
    const distanceKm = activity.distance / 1000;
    const distanceKmRounded = Math.round((distanceKm + Number.EPSILON) * 100) / 100;

    const timeHours = activity.moving_time / 3600;
    const timeHoursRounded = Math.round((timeHours + Number.EPSILON) * 10) / 10;

    readmeTemplate += [
      '<tr>',
      '<th colspan="2">',
      `<a href="https://www.strava.com/activities/${activity.id}">`,
      `${typeEmoji}${activity.name}`,
      '</a>',
      '</th>',
      '</tr><tr>',
      '<td>',
      '',
      `**${activity.type} on ${activityDate.toISOString().substring(0, 10)}**`,
      '',
      `- Distance: ${distanceKmRounded} km`,
      `- Time: ${timeHoursRounded} h`,
      `- Elevation Gain: ${activity.total_elevation_gain} m`,
      '</td>',
      '<td>',
      `<a href="assets/${activity.id}-map-large.png"><img src="assets/${activity.id}-map.png" alt="Map"></a>`,
    ].join('\n');
    
    if (photo) {
      readmeTemplate += `<a href="assets/${activity.id}-photo.jpg"><img src="assets/${activity.id}-photo.jpg" alt="Activity Photo" height="180"></a>\n`;
    }

    readmeTemplate += [
      '</td>',
      '</tr>'
    ].join('\n');
  }
  browser.close();

  readmeTemplate += '</table>';

  fs.writeFileSync('README.md', readmeTemplate);
})();

async function getAccessToken(refreshToken) {
  const tokenUrl = `${oauthBaseUrl}/token`;

  const tokenResponse = await fetch(
    `${tokenUrl}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`,
    { method: 'POST' }
  );

  const jsonBody = await tokenResponse.json();

  return jsonBody.access_token;
}

async function listActivities(accessToken, page, perPage, before, after) {
  const activitiesUrl = `${baseUrl}/athlete/activities`
  let queryParams = {};
  if (page) { queryParams.page = page; }
  if (perPage) { queryParams.per_page = perPage; }
  if (before) { queryParams.before = before; }
  if (after) { queryParams.after = after; }

  const response = await fetch(urlWithParams(activitiesUrl, queryParams), {
    headers: {
      'authorization': `Bearer ${accessToken}`
    }
  });

  return await response.json();
}

async function getActivity(accessToken, activityId, includeAllEfforts) {
  const activityUrl = `${baseUrl}/activities/${activityId}`
  let queryParams = {};
  if (includeAllEfforts) { queryParams.include_all_efforts = true; }

  const response = await fetch(urlWithParams(activityUrl, queryParams), {
    headers: {
      'authorization': `Bearer ${accessToken}`
    }
  });

  return await response.json();
}

async function createMap(browser, activity) {
  const mapTemplate = fs.readFileSync('./map-template.html').toString()
    .replace('{{{apiKey}}}', thunderforestApiKey)
    .replace('{{{encodedRoute}}}', JSON.stringify(activity.map.polyline));

  const id = activity.id;

  const htmlFileName = `${assetsDirectory}/${id}.html`;
  const pngFileName = `${assetsDirectory}/${id}-map.png`;
  const largePngFileName = `${assetsDirectory}/${id}-map-large.png`;

  if (!fs.existsSync(assetsDirectory)) {
    fs.mkdirSync(assetsDirectory);
  }
  fs.writeFileSync(htmlFileName, mapTemplate);

  console.log(`created map ${htmlFileName}`);

  const page = await browser.newPage();

  await page.setViewport({
    width: 180,
    height: 180
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.goto(`file://${htmlFileName}`),
  ]);
  await page.screenshot({ path: pngFileName });

  await page.setViewport({
    width: 800,
    height: 800
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.goto(`file://${htmlFileName}`),
  ]);
  await page.screenshot({ path: largePngFileName });
  
  
  console.log(`created screenshot ${pngFileName}`);
  await page.close();
  fs.rmSync(htmlFileName);

  return pngFileName;
}

async function downloadActivityPhoto(activity) {
  if (!activity.photos.primary) {
    return null;
  }

  const photoFilename = `${assetsDirectory}/${activity.id}-photo.jpg`;
  const response = await fetch(activity.photos.primary.urls['600']);
  const content = await response.arrayBuffer();
  fs.writeFileSync(photoFilename, new Uint8Array(content));

  console.log(`downloaded activity photo ${photoFilename}`);

  return photoFilename;
}

function urlWithParams(url, params) {
  return url + (
    Object.keys(params).length
      ? '?' + Object.keys(params)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&')
      : ''
  );
}