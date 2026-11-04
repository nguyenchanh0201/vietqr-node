require('./scenario.cjs')
  .run('CJS', require('vietqr-node'), require('vietqr-node/deeplink'), require)
  .catch((error) => { console.error(error); process.exit(1); });
