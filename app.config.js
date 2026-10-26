/**
 * [N1] app.config.js — app.json, plus the things that must not be committed.
 *
 * Expo reads this INSTEAD of app.json when it exists, so app.json is
 * imported and spread rather than duplicated: everything stays in one
 * place and this file holds only what has to come from the environment.
 *
 * ── Why google-services.json is not in the repo ─────────────────────────────
 * It carries the Firebase project's API key and sender id for this app.
 * Neither is a password, but together they identify the project that can
 * deliver push to every install, and a file in git is a file in every fork
 * and every clone forever. It comes from an EAS FILE environment variable
 * instead, which EAS materialises on the build machine and deletes after.
 *
 * Set it once, per environment:
 *
 *   eas env:create --scope project --name GOOGLE_SERVICES_JSON \
 *     --type file --value ./google-services.json \
 *     --visibility secret --environment development
 *
 *   # then the same for --environment preview and --environment production
 *
 * Confirm with:  eas env:list development
 *
 * A LOCAL build (npx expo run:android) reads it from .env like every other
 * variable in this project — gradle reads .env, not eas.json:
 *
 *   GOOGLE_SERVICES_JSON=./google-services.json
 *
 * ── When it is absent ───────────────────────────────────────────────────────
 * The key is simply omitted rather than set to undefined. A prebuild with
 * `googleServicesFile: undefined` fails with a path error; without the key
 * it builds fine and push is inert — which is the right behaviour for a
 * simulator build, a CI typecheck, or anybody who has not set it up yet.
 */

const base = require('./app.json');

module.exports = () => {
  const expo = { ...base.expo };
  const googleServices = process.env.GOOGLE_SERVICES_JSON;

  if (googleServices) {
    expo.android = { ...expo.android, googleServicesFile: googleServices };
  }

  return expo;
};
