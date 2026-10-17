// jest stub for isomorphic-dompurify (see ../jest.config.js): the real package
// pulls in jsdom and ESM-only dependencies jest cannot load. The specs here do
// not sanitise HTML, they only need the module to load.
const stub = {
  addHook: () => {},
  removeHook: () => {},
  sanitize: (html) => html,
};
module.exports = { __esModule: true, default: stub, ...stub };
