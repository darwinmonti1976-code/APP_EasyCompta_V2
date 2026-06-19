const path = require('path');
const fs   = require('fs');

const APP_GROUP     = 'group.com.darwinmonti.easycompta';
const WIDGET_TARGET = 'EasyComptaWidget';
const BUNDLE_ID     = 'com.darwinmonti.easycompta.widget';
const MODULE_IOS    = path.join(__dirname, '..', 'modules', 'widget-bridge', 'ios', 'EasyComptaWidget');

module.exports = function withIOSWidget(config) {
  // eslint-disable-next-line import/no-extraneous-dependencies
  const { withXcodeProject, withEntitlementsPlist, withDangerousMod } = require('@expo/config-plugins');
  // ── Entitlements: App Group on the main app ────────────────────────────
  config = withEntitlementsPlist(config, (cfg) => {
    const groups = cfg.modResults['com.apple.security.application-groups'] ?? [];
    if (!groups.includes(APP_GROUP)) {
      cfg.modResults['com.apple.security.application-groups'] = [...groups, APP_GROUP];
    }
    return cfg;
  });

  // ── Copy Swift extension files ─────────────────────────────────────────
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const destDir = path.join(projectRoot, WIDGET_TARGET);
      fs.mkdirSync(destDir, { recursive: true });

      // Copy EasyComptaWidget.swift
      fs.copyFileSync(
        path.join(MODULE_IOS, 'EasyComptaWidget.swift'),
        path.join(destDir, 'EasyComptaWidget.swift')
      );

      // Write widget-specific entitlements file
      const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${APP_GROUP}</string>
  </array>
</dict>
</plist>`;
      fs.writeFileSync(path.join(destDir, `${WIDGET_TARGET}.entitlements`), entitlements);

      // Minimal Info.plist for the extension
      const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>`;
      fs.writeFileSync(path.join(destDir, 'Info.plist'), infoPlist);

      return cfg;
    },
  ]);

  // ── Add widget extension target to Xcode project ──────────────────────
  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const appName      = cfg.modRequest.projectName;

    // Skip if target already exists
    const targets = xcodeProject.pbxNativeTargetSection();
    const alreadyExists = Object.values(targets).some(
      (t) => typeof t === 'object' && t.name === WIDGET_TARGET
    );
    if (alreadyExists) return cfg;

    // Add a new native target (widget extension)
    const targetUUID  = xcodeProject.generateUuid();
    const groupUUID   = xcodeProject.generateUuid();
    const buildPhaseUUID = xcodeProject.generateUuid();
    const configListUUID = xcodeProject.generateUuid();
    const debugConfigUUID   = xcodeProject.generateUuid();
    const releaseConfigUUID = xcodeProject.generateUuid();

    // Source files group
    xcodeProject.addPbxGroup(
      ['EasyComptaWidget.swift', 'Info.plist', `${WIDGET_TARGET}.entitlements`],
      WIDGET_TARGET,
      WIDGET_TARGET
    );

    // Build configurations
    const commonSettings = {
      ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: '"NO"',
      CLANG_ANALYZER_NONNULL: '"YES"',
      CODE_SIGN_ENTITLEMENTS: `"${WIDGET_TARGET}/${WIDGET_TARGET}.entitlements"`,
      INFOPLIST_FILE: `"${WIDGET_TARGET}/Info.plist"`,
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      PRODUCT_BUNDLE_IDENTIFIER: `"${BUNDLE_ID}"`,
      PRODUCT_NAME: `"$(TARGET_NAME)"`,
      SKIP_INSTALL: '"YES"',
      SWIFT_VERSION: '"5.0"',
      TARGETED_DEVICE_FAMILY: '"1,2"',
    };

    xcodeProject.pbxXCBuildConfigurationSection()[debugConfigUUID] = {
      isa: 'XCBuildConfiguration',
      buildSettings: { ...commonSettings, DEBUG_INFORMATION_FORMAT: '"dwarf"' },
      name: 'Debug',
    };
    xcodeProject.pbxXCBuildConfigurationSection()[releaseConfigUUID] = {
      isa: 'XCBuildConfiguration',
      buildSettings: { ...commonSettings, DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"' },
      name: 'Release',
    };
    xcodeProject.pbxXCConfigurationListSection()[configListUUID] = {
      isa: 'XCConfigurationList',
      buildConfigurations: [
        { value: debugConfigUUID,   comment: 'Debug' },
        { value: releaseConfigUUID, comment: 'Release' },
      ],
      defaultConfigurationIsVisible: 0,
      defaultConfigurationName: 'Release',
    };

    // Sources build phase
    xcodeProject.pbxSourcesBuildPhaseSection()[buildPhaseUUID] = {
      isa: 'PBXSourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };

    // Native target
    xcodeProject.pbxNativeTargetSection()[targetUUID] = {
      isa: 'PBXNativeTarget',
      buildConfigurationList: configListUUID,
      buildPhases: [{ value: buildPhaseUUID, comment: 'Sources' }],
      buildRules: [],
      dependencies: [],
      name: WIDGET_TARGET,
      productName: WIDGET_TARGET,
      productReference: groupUUID,
      productType: '"com.apple.product-type.app-extension"',
    };

    // Embed in main app
    xcodeProject.addTargetDependency(
      xcodeProject.getFirstTarget().uuid,
      [{ value: targetUUID, comment: WIDGET_TARGET }]
    );

    return cfg;
  });

  return config;
};
