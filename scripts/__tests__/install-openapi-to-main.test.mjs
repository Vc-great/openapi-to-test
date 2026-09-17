import assert from "node:assert/strict";
import test from "node:test";
import {
  createSourceIsolationProfile,
  createCurrentMainWorkspaceYaml,
  createProvenance,
  inspectSourceToolchain,
  isGeneratedWorkspaceYaml,
  priorArtifactOwnsContent,
  readInstalledPackageManager,
  satisfiesEngineRange,
  validateGeneratedWorkspaceYaml,
  verifyLockfileLocalArtifacts,
  validatePriorArtifactProvenance,
  workspaceSourceHead,
} from "../lib/openapi-to-main.mjs";

const head = "ee5ebbb4fd415ff740c698cf577e8e8ce4b8f5d2";

function packageItem(name, filename = `${name.replaceAll("/", "-")}-1.2.3.tgz`) {
  return { name, version: "1.2.3", filename };
}

function canonicalHelpers() {
  return {
    createPackedOverrides(packed) {
      return Object.fromEntries(packed.map(({ name, archive }) => [name, `file:${archive}`]));
    },
    createWorkspaceOverridesYaml(overrides) {
      return ["overrides:", ...Object.entries(overrides).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`), ""].join("\n");
    },
  };
}

test("source toolchain requires an exact pnpm declaration and validates Node and pnpm engines", () => {
  assert.deepEqual(
    inspectSourceToolchain({
      packageManager: "pnpm@11.26.0",
      engines: { node: ">=22.13.0", pnpm: ">=11 <12" },
    }, "v24.20.0"),
    {
      packageManager: "pnpm@11.26.0",
      pnpmVersion: "11.26.0",
      engines: { node: ">=22.13.0", pnpm: ">=11 <12" },
    },
  );
  assert.throws(
    () => inspectSourceToolchain({ packageManager: "npm@10.0.0" }, "v24.20.0"),
    /exact pnpm@<version>/,
  );
  assert.throws(
    () => inspectSourceToolchain({ packageManager: "pnpm@11.26.0", engines: { node: ">=25" } }, "v24.20.0"),
    /Unsupported Node/,
  );
  assert.throws(
    () => inspectSourceToolchain({ packageManager: "pnpm@10.0.0", engines: { pnpm: ">=11 <12" } }, "v24.20.0"),
    /Unsupported pnpm/,
  );
});

test("source isolation blocks host home reads and writes", () => {
  const profile = createSourceIsolationProfile(
    "/Users/example",
    ["/private/tmp/source.sandbox", "/private/tmp/empty.npmrc"],
    ["/Volumes/home/example"],
    ["/private/var/folders/example/T"],
    ["/private/var/folders/example/T/tarballs"],
    ["/workspace/openapi-to-test"],
  );
  assert.match(profile, /\(deny file-read\* \(subpath "\/Users\/example"\)\)/);
  assert.match(profile, /\(deny file-write\* \(subpath "\/Users\/example"\)\)/);
  assert.match(profile, /\(deny file-read\* \(subpath "\/Volumes\/home\/example"\)\)/);
  assert.match(profile, /\(deny file-write\* \(literal "\/private\/tmp\/source\.sandbox"\)\)/);
  assert.match(profile, /\(deny file-write\* \(literal "\/private\/tmp\/empty\.npmrc"\)\)/);
  assert.match(profile, /\(deny file-write\* \(literal "\/private\/var\/folders\/example\/T"\)\)/);
  assert.match(profile, /\(deny file-write\* \(subpath "\/private\/var\/folders\/example\/T\/tarballs"\)\)/);
  assert.match(profile, /\(deny file-read\* \(subpath "\/workspace\/openapi-to-test"\)\)/);
  assert.match(profile, /\(deny file-write\* \(subpath "\/workspace\/openapi-to-test"\)\)/);
  assert.throws(() => createSourceIsolationProfile("relative/home"), /absolute host home directory/);
});

test("engine range comparisons support source constraints and reject unknown syntax", () => {
  assert.equal(satisfiesEngineRange("v24.20.0", ">=22.13.0 <25"), true);
  assert.equal(satisfiesEngineRange("24.20.0", "^24.0.0"), true);
  assert.equal(satisfiesEngineRange("22.13.0", "~22"), true);
  assert.equal(satisfiesEngineRange("22.13.0", "22.x"), true);
  assert.equal(satisfiesEngineRange("23.0.0", "22.x"), false);
  assert.equal(satisfiesEngineRange("22.13.0", ">22"), false);
  assert.equal(satisfiesEngineRange("23.0.0", ">22"), true);
  assert.equal(satisfiesEngineRange("22.13.0", "<=22"), true);
  assert.equal(satisfiesEngineRange("23.0.0", "<=22"), false);
  assert.equal(satisfiesEngineRange("22.13.9", "<=22.13"), true);
  assert.equal(satisfiesEngineRange("22.13.9", ">22.13"), false);
  assert.equal(satisfiesEngineRange("22.14.0", ">22.13"), true);
  assert.equal(satisfiesEngineRange("23.0.0-rc.1", ">22"), false);
  assert.equal(satisfiesEngineRange("22.14.0-rc.1", ">22.13"), false);
  assert.equal(satisfiesEngineRange("23.0.0-rc.1", "<=22"), false);
  assert.equal(satisfiesEngineRange("23.0.0-rc.1", ">=22 <24"), false);
  assert.equal(satisfiesEngineRange("23.0.0-rc.10", ">=23.0.0-rc.2 <23.0.0"), true);
  assert.equal(satisfiesEngineRange("23.0.0-rc.1", ">=23.0.0-rc.2 <23.0.0"), false);
  assert.equal(satisfiesEngineRange("24.20.0", "~24.19.0"), false);
  assert.equal(satisfiesEngineRange("24.20.0", ">=25 || ^24.0.0"), true);
  assert.equal(satisfiesEngineRange("24.20.0", "latest"), false);
});

test("installed pnpm manager state is read from JSON and legacy YAML layouts", () => {
  assert.equal(readInstalledPackageManager('{"packageManager":"pnpm@10.33.0"}'), "pnpm@10.33.0");
  assert.equal(readInstalledPackageManager("packageManager: pnpm@10.33.0\nlayoutVersion: 5\n"), "pnpm@10.33.0");
  assert.equal(readInstalledPackageManager("layoutVersion: 5\n"), undefined);
});

test("workspace overrides reuse canonical helpers and contain only relative SHA-scoped paths", () => {
  const { yaml, expectedPaths } = createCurrentMainWorkspaceYaml({
    packed: [packageItem("openapi-to"), packageItem("@openapi-to/core")],
    sourceHead: head,
    ...canonicalHelpers(),
  });
  assert.equal(expectedPaths["openapi-to"], `.openapi-to-local/${head}/tarballs/openapi-to-1.2.3.tgz`);
  assert.equal(expectedPaths["@openapi-to/core"], `.openapi-to-local/${head}/tarballs/@openapi-to-core-1.2.3.tgz`);
  assert.match(yaml, /^# Generated by scripts\/install-openapi-to-main\.mjs\n# Source HEAD: [a-f0-9]+/);
  assert.match(yaml, /"openapi-to": "file:\.openapi-to-local\//);
  assert.match(yaml, /onlyBuiltDependencies:\n  - esbuild\n  - msw\n  - vue-demi/);
  assert.match(yaml, /allowBuilds:\n  esbuild: true\n  msw: true\n  vue-demi: true/);
  assert.doesNotMatch(yaml, /(?:\/private\/tmp|\/Users\/|[A-Z]:\\)/);
  assert.throws(() => createCurrentMainWorkspaceYaml({
    packed: [packageItem("openapi-to", "../escape.tgz")],
    sourceHead: head,
    ...canonicalHelpers(),
  }), /Invalid packed filename/);
  assert.throws(() => createCurrentMainWorkspaceYaml({
    packed: [packageItem("openapi-to", "..\\escape.tgz")],
    sourceHead: head,
    ...canonicalHelpers(),
  }), /Invalid packed filename/);
});

test("unknown workspace YAML is not considered owned and generated ownership is source-bound", () => {
  const generated = `# Generated by scripts/install-openapi-to-main.mjs\n# Source HEAD: ${head}\n# Consumer-only current-main test settings.\noverrides:\n`;
  assert.equal(isGeneratedWorkspaceYaml(generated), true);
  assert.equal(workspaceSourceHead(generated), head);
  assert.equal(isGeneratedWorkspaceYaml("packages:\n  - apps/*\n"), false);
  assert.equal(isGeneratedWorkspaceYaml(`# Generated by scripts/install-openapi-to-main.mjs\n# Source HEAD: /tmp/source\noverrides:\n`), false);
});

test("generated workspace is refreshable only while all settings match previous provenance", () => {
  const packages = [packageItem("openapi-to"), packageItem("@openapi-to/core")].map(({ name, filename }) => ({ name, tarball: filename }));
  const generated = createCurrentMainWorkspaceYaml({
    packed: [packageItem("openapi-to"), packageItem("@openapi-to/core")],
    sourceHead: head,
    ...canonicalHelpers(),
  }).yaml;
  assert.doesNotThrow(() => validateGeneratedWorkspaceYaml(generated, packages));
  assert.throws(
    () => validateGeneratedWorkspaceYaml(`${generated}packageExtensions:\n  unknown: {}`, packages),
    /unknown or missing top-level settings/,
  );
  assert.throws(
    () => validateGeneratedWorkspaceYaml(generated.replace('"openapi-to":', '"unowned":'), packages),
    /do not match the prior provenance/,
  );
});

test("provenance records source identity and tarball hash, size and relative path", () => {
  const packageEntry = {
    name: "openapi-to",
    version: "1.2.3",
    tarball: "openapi-to-1.2.3.tgz",
    path: `.openapi-to-local/${head}/tarballs/openapi-to-1.2.3.tgz`,
    bytes: 42,
    sha256: "a".repeat(64),
    integrity: `sha512-${"A".repeat(86)}==`,
    sourceHead: head,
  };
  const provenance = createProvenance({
    sourceHead: head,
    packageManager: "pnpm@11.26.0",
    nodeVersion: "v24.20.0",
    packedAt: "2026-09-16T00:00:00.000Z",
    packages: [packageEntry],
  });
  assert.equal(provenance.schemaVersion, 1);
  assert.deepEqual(provenance.source, { repository: "openapi-to/openapi-to", ref: "main", head });
  assert.equal(provenance.packages[0].sha256, "a".repeat(64));
  assert.equal(provenance.packages[0].bytes, 42);
  assert.deepEqual(validatePriorArtifactProvenance(provenance, head), provenance);
  assert.equal(priorArtifactOwnsContent(provenance, packageEntry.tarball, "a".repeat(64), head), true);
  assert.equal(priorArtifactOwnsContent(provenance, packageEntry.tarball, "b".repeat(64), head), false);
  assert.throws(() => validatePriorArtifactProvenance({
    ...provenance,
    packages: [{ ...packageEntry, sha256: "invalid" }],
  }, head), /invalid or duplicate package artifact entry/);
  assert.throws(() => createProvenance({
    sourceHead: head,
    packageManager: provenance.packageManager,
    nodeVersion: provenance.node,
    packedAt: provenance.packedAt,
    packages: [{ ...packageEntry, sha256: "nope" }],
  }), /required artifact identity fields/);
});

test("lockfile verification requires every canonical package to resolve from this SHA's tarball", () => {
  const paths = {
    "openapi-to": `.openapi-to-local/${head}/tarballs/openapi-to-1.2.3.tgz`,
    "@openapi-to/core": `.openapi-to-local/${head}/tarballs/openapi-to-core-1.2.3.tgz`,
  };
  const integrities = {
    "openapi-to": "sha512-openapi",
    "@openapi-to/core": "sha512-core",
  };
  const localLock = `packages:\n  '@openapi-to/core@file:${paths["@openapi-to/core"]}':\n    resolution: {integrity: ${integrities["@openapi-to/core"]}, tarball: file:${paths["@openapi-to/core"]}}\n  openapi-to@file:${paths["openapi-to"]}:\n    resolution: {integrity: ${integrities["openapi-to"]}, tarball: file:${paths["openapi-to"]}}\nsnapshots:\n`;
  assert.equal(verifyLockfileLocalArtifacts(localLock, paths, integrities), 2);
  assert.throws(
    () => verifyLockfileLocalArtifacts(localLock, paths, { ...integrities, "openapi-to": "sha512-wrong" }),
    /openapi-to: lockfile integrity does not match/,
  );
  const fallbackLock = localLock.replaceAll(`file:${paths["@openapi-to/core"]}`, "registry:4.5.6");
  assert.throws(() => verifyLockfileLocalArtifacts(fallbackLock, paths), /@openapi-to\/core: lockfile contains a package resolution/);
});
