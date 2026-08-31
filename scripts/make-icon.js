const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const SHIELD_PATH =
  'M2 28.8288V5C2 3.34 2.56887 2 4.22887 2H35C36.66 2 38 3.34 38 5V28.8288C38 30.387 37.136 31.8101 35.7711 32.5L21.7711 39.5768C20.6547 40.1411 19.3453 40.1411 18.2289 39.5768L4.22888 32.5C2.86401 31.8101 2 30.387 2 28.8288Z';
const ICON_PATH =
  'M20.5035 17.9345C20.9321 19.1409 22.6463 20.2925 22.83 19.078C22.8923 18.6663 22.7547 18.1522 22.6029 17.5848C22.3069 16.4788 21.9567 15.1705 22.928 14.0243C23.6521 13.1697 24.4087 12.719 25.2105 12.2414C26.0355 11.7499 26.9085 11.2299 27.8434 10.2118C27.8434 10.2118 29 9.31251 29 7.50001C29 6.50002 28.2812 6.70001 26 6.70001H8.3428C6.34954 6.70001 6.43977 8.00002 6.43995 12.18C6.44 13.34 7.26761 15.018 7.65956 15.8821C7.89526 16.4017 8.13366 16.9363 8.34276 17.45C8.75028 18.4511 10.8303 19.296 12.9692 20.1649L13.0369 20.1925C15.2145 21.0772 17.1978 21.5198 18 23.0708C18.5472 24.1289 18.5041 24.7467 18.4561 25.4358C18.3802 26.5252 18.4561 27.3363 19 28.1888C19.166 28.449 19.4418 28.7426 19.7126 29.0404C20.3158 29.7041 20.8135 30.7208 20.603 31.6012C20.192 33.3193 19.1191 35.8477 21.9701 34.4978L23.1209 33.916C25.2636 32.8329 27.5936 27.805 29.3686 26.1672C29.8 25.7691 30.2116 25.3488 30.5346 24.905C30.8838 24.4253 30.8752 23.7615 30.4895 23.3121C28.5252 21.0236 25.9682 21.8336 23.4974 22.1013L23.4974 22.1013C22.0058 22.2629 20.6982 22.4046 20 22.0472C19.6367 21.8613 19.2621 21.6887 18.8957 21.5198C17.2442 20.7587 15.7574 20.0735 16.2178 18.5926C16.7002 17.0407 19.6914 15.6487 20.5035 17.9345Z';

const ACCENT = '#003366';

const svg = `<svg width="256" height="256" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <path d="${SHIELD_PATH}" fill="${ACCENT}" />
  <path d="${ICON_PATH}" fill="#ffffff" />
</svg>`;

async function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(buildDir, { recursive: true });

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    pngBuffers.push(buf);
  }

  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1]);

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);

  console.log('Icon generated at build/icon.ico and build/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
