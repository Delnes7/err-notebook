#!/usr/bin/env python3
"""Generate the small dependency-free Xcode project; no third-party generator required."""
from pathlib import Path
import hashlib
ROOT = Path(__file__).resolve().parents[1]
P = ROOT / 'ios/ErrorNotebook.xcodeproj'
P.mkdir(exist_ok=True)
def uid(name): return hashlib.sha1(name.encode()).hexdigest()[:24].upper()
def ref(name): return uid(name)
objects = []
def obj(name, body): objects.append(f'{uid(name)} = {{ {body} }};')
def refs(names): return '(' + ', '.join(uid(n) for n in names) + ',)'
sources = sorted(p.name for p in (ROOT / 'ios/ErrorNotebook').glob('*.swift'))
resources = ['Web','Assets.xcassets','PrivacyInfo.xcprivacy','self-test.js','native-contract.js','test-image.heic']
for f in sources + resources + ['Info.plist', 'ErrorNotebookUITests.swift']:
 typ = 'sourcecode.swift' if f.endswith('.swift') else {'Web':'folder','Assets.xcassets':'folder.assetcatalog','PrivacyInfo.xcprivacy':'text.xml','Info.plist':'text.plist.xml','test-image.heic':'image' }.get(f,'sourcecode.javascript')
 obj(f, f'isa = PBXFileReference; lastKnownFileType = {typ}; path = "{f}"; sourceTree = "<group>";')
 if f != 'Info.plist': obj('build:'+f, f'isa = PBXBuildFile; fileRef = {uid(f)};')
for name, typ in [('ErrorNotebook.app','wrapper.application'),('ErrorNotebookUITests.xctest','wrapper.cfbundle')]:
 obj(name,f'isa = PBXFileReference; explicitFileType = {typ}; path = {name}; sourceTree = BUILT_PRODUCTS_DIR;')
obj('app-group',f'isa = PBXGroup; children = {refs(sources+resources+["Info.plist"])}; path = ErrorNotebook; sourceTree = "<group>";')
obj('test-group',f'isa = PBXGroup; children = {refs(["ErrorNotebookUITests.swift"])}; path = ErrorNotebookUITests; sourceTree = "<group>";')
obj('products',f'isa = PBXGroup; children = {refs(["ErrorNotebook.app","ErrorNotebookUITests.xctest"])}; name = Products; sourceTree = "<group>";')
obj('root',f'isa = PBXGroup; children = {refs(["app-group","test-group","products"])}; sourceTree = "<group>";')
for name, isa, files in [('sources','PBXSourcesBuildPhase',sources),('resources','PBXResourcesBuildPhase',resources),('frameworks','PBXFrameworksBuildPhase',[]),('test-sources','PBXSourcesBuildPhase',['ErrorNotebookUITests.swift']),('test-resources','PBXResourcesBuildPhase',[]),('test-frameworks','PBXFrameworksBuildPhase',[])]:
 filelist = refs(['build:'+f for f in files]) if files else '()'
 obj(name,f'isa = {isa}; buildActionMask = 2147483647; files = {filelist}; runOnlyForDeploymentPostprocessing = 0;')
base = 'SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 16.4; SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; '
for scope in ['project','app','test']:
 for conf in ['Debug','Release']:
  settings = base
  settings += 'SWIFT_OPTIMIZATION_LEVEL = "-Onone"; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; ENABLE_TESTABILITY = YES; DEBUG_INFORMATION_FORMAT = dwarf; ' if conf=='Debug' else 'SWIFT_OPTIMIZATION_LEVEL = "-O"; DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; '
  if scope=='app': settings += 'PRODUCT_NAME = ErrorNotebook; PRODUCT_BUNDLE_IDENTIFIER = com.delnes.errornotebook; INFOPLIST_FILE = ErrorNotebook/Info.plist; CODE_SIGN_STYLE = Automatic; TARGETED_DEVICE_FAMILY = "1,2"; ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; SUPPORTS_MACCATALYST = NO; ENABLE_USER_SCRIPT_SANDBOXING = YES; '
  if scope=='app' and conf=='Release': settings += 'EXCLUDED_SOURCE_FILE_NAMES = ("self-test.js", "native-contract.js", "test-image.heic"); '
  if scope=='test': settings += 'PRODUCT_NAME = ErrorNotebookUITests; PRODUCT_BUNDLE_IDENTIFIER = com.delnes.errornotebook.uitests; GENERATE_INFOPLIST_FILE = YES; TEST_TARGET_NAME = ErrorNotebook; CODE_SIGN_STYLE = Automatic; TARGETED_DEVICE_FAMILY = "1,2"; '
  obj(scope+conf,f'isa = XCBuildConfiguration; buildSettings = {{ {settings} }}; name = {conf};')
 obj(scope+'config',f'isa = XCConfigurationList; buildConfigurations = {refs([scope+"Debug",scope+"Release"])}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
obj('app',f'isa = PBXNativeTarget; buildConfigurationList = {uid("appconfig")}; buildPhases = {refs(["sources","frameworks","resources"])}; buildRules = (); dependencies = (); name = ErrorNotebook; productName = ErrorNotebook; productReference = {uid("ErrorNotebook.app")}; productType = "com.apple.product-type.application";')
obj('proxy',f'isa = PBXContainerItemProxy; containerPortal = {uid("project")}; proxyType = 1; remoteGlobalIDString = {uid("app")}; remoteInfo = ErrorNotebook;')
obj('dependency',f'isa = PBXTargetDependency; target = {uid("app")}; targetProxy = {uid("proxy")};')
obj('test',f'isa = PBXNativeTarget; buildConfigurationList = {uid("testconfig")}; buildPhases = {refs(["test-sources","test-frameworks","test-resources"])}; buildRules = (); dependencies = {refs(["dependency"])}; name = ErrorNotebookUITests; productName = ErrorNotebookUITests; productReference = {uid("ErrorNotebookUITests.xctest")}; productType = "com.apple.product-type.bundle.ui-testing";')
obj('project',f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; TargetAttributes = {{ {uid("app")} = {{ CreatedOnToolsVersion = 16.0; }}; {uid("test")} = {{ CreatedOnToolsVersion = 16.0; TestTargetID = {uid("app")}; }}; }}; }}; buildConfigurationList = {uid("projectconfig")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en, Base, "zh-Hans"); mainGroup = {uid("root")}; productRefGroup = {uid("products")}; projectDirPath = ""; projectRoot = ""; targets = {refs(["app","test"])};')
(P/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {uid("project")}; }}\n')
scheme = P/'xcshareddata/xcschemes/ErrorNotebook.xcscheme'
scheme.parent.mkdir(parents=True, exist_ok=True)
def buildable(target, product): return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(target)}" BuildableName="{product}" BlueprintName="{product.split(".")[0]}" ReferencedContainer="container:ErrorNotebook.xcodeproj"/>'
scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{buildable('app','ErrorNotebook.app')}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{buildable('test','ErrorNotebookUITests.xctest')}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildable('app','ErrorNotebook.app')}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildable('app','ErrorNotebook.app')}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
print('Generated',P)
