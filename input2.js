'use strict';

var karmaConfigFactory = require('./karma-jquery.conf-factory');

module.exports = karmaConfigFactory();
'use strict';

exports.config = {
  allScriptsTimeout: 11000,

  specs: [
    'test/e2e/tests/**/*.js',
    'build/docs/ptore2e/**/*.js',
    'docs/app/e2e/*.scenario.js'
  ],

  capabilities: {
    'browserName': 'chrome'
  },

  baseUrl: 'http://localhost:8000/',

  framework: 'jasmine2',

  onPrepare: function() {
    /* global angular: false, browser: false, jasmine: false */

    // Disable animations so e2e tests run more quickly
    var disableNgAnimate = function() {
      angular.module('disableNgAnimate', []).run(['$animate', function($animate) {
        $animate.enabled(false);
      }]);
    };

    browser.addMockModule('disableNgAnimate', disableNgAnimate);

    var reporters = require('jasmine-reporters');
    jasmine.getEnv().addReporter(new reporters.JUnitXmlReporter({
      savePath: 'test_out/docs-e2e-' + exports.config.capabilities.browserName + '-'
    }));
  },

  jasmineNodeOpts: {
    defaultTimeoutInterval: 30000,
    showColors: false
  }
};
'use strict';

var fs = require('fs');
var http = require('http');
var BrowserStackTunnel = require('browserstacktunnel-wrapper');

var HOSTNAME = 'localhost';
var PORTS = [9876, 8000];
var ACCESS_KEY = process.env.BROWSER_STACK_ACCESS_KEY;
var READY_FILE = process.env.BROWSER_PROVIDER_READY_FILE;
var TUNNEL_IDENTIFIER = process.env.TRAVIS_JOB_NUMBER;

// We need to start fake servers, otherwise the tunnel does not start.
var fakeServers = [];
var hosts = [];

PORTS.forEach(function(port) {
  fakeServers.push(http.createServer(function() {}).listen(port));
  hosts.push({
    name: HOSTNAME,
    port: port,
    sslFlag: 0
  });
});

var tunnel = new BrowserStackTunnel({
  key: ACCESS_KEY,
  localIdentifier: TUNNEL_IDENTIFIER,
  hosts: hosts
});

console.log('Starting tunnel on ports', PORTS.join(', '));
tunnel.start(function(error) {
  if (error) {
    console.error('Can not establish the tunnel', error);
  } else {
    console.log('Tunnel established.');
    fakeServers.forEach(function(server) {
      server.close();
    });

    if (READY_FILE) {
      fs.writeFile(READY_FILE, '');
    }
  }
});

tunnel.on('error', function(error) {
  console.error(error);
});
'use strict';

/* global qFactory: false */
/* exported
 isFunction,
 isPromiseLike,
 isObject,
 isUndefined,
 minErr,
 extend
*/

/* eslint-disable no-unused-vars */
function isFunction(value) { return typeof value === 'function'; }
function isPromiseLike(obj) { return obj && isFunction(obj.then); }
function isObject(value) { return value !== null && typeof value === 'object'; }
function isUndefined(value) { return typeof value === 'undefined'; }

function minErr(module, constructor) {
  return function() {
    var ErrorConstructor = constructor || Error;
    throw new ErrorConstructor(module + arguments[0] + arguments[1]);
  };
}

function extend(dst) {
  for (var i = 1, ii = arguments.length; i < ii; i++) {
    var obj = arguments[i];
    if (obj) {
      var keys = Object.keys(obj);
      for (var j = 0, jj = keys.length; j < jj; j++) {
        var key = keys[j];
        dst[key] = obj[key];
      }
    }
  }
  return dst;
}
/* eslint-enable */

var $q = qFactory(process.nextTick, function noopExceptionHandler() {});

exports.resolved = $q.resolve;
exports.rejected = $q.reject;
exports.deferred = $q.defer;
'use strict';

/* eslint-disable no-invalid-this */

var bower = require('bower');
var util = require('./utils.js');
var npmRun = require('npm-run');

module.exports = function(grunt) {

  grunt.registerMultiTask('min', 'minify JS files', function() {
    util.min(this.data, this.async());
  });


  grunt.registerTask('minall', 'minify all the JS files in parallel', function() {
    var files = grunt.config('min');
    files = Object.keys(files).map(function(key) { return files[key]; });
    grunt.util.async.forEach(files, util.min.bind(util), this.async());
  });


  grunt.registerMultiTask('build', 'build JS files', function() {
    util.build(this.data, this.async());
  });


  grunt.registerTask('buildall', 'build all the JS files in parallel', function() {
    var builds = grunt.config('build');
    builds = Object.keys(builds).map(function(key) { return builds[key]; });
    grunt.util.async.forEach(builds, util.build.bind(util), this.async());
  });


  grunt.registerMultiTask('write', 'write content to a file', function() {
    grunt.file.write(this.data.file, this.data.val);
    grunt.log.ok('wrote to ' + this.data.file);
  });


  grunt.registerTask('docs', 'create AngularJS docs', function() {
    npmRun.execSync('gulp --gulpfile docs/gulpfile.js', {stdio: 'inherit'});
  });


  grunt.registerMultiTask('tests', '**Use `grunt test` instead**', function() {
    util.startKarma(this.data, true, this.async());
  });


  grunt.registerMultiTask('autotest', 'Run and watch the unit tests with Karma', function() {
    util.startKarma(this.data, false, this.async());
  });

  grunt.registerTask('webdriver', 'Update webdriver', function() {
    util.updateWebdriver(this.async());
  });

  grunt.registerMultiTask('protractor', 'Run Protractor integration tests', function() {
    util.startProtractor(this.data, this.async());
  });

  grunt.registerTask('collect-errors', 'Combine stripped error files', function() {
    util.collectErrors();
  });

  grunt.registerTask('bower', 'Install Bower packages.', function() {
    var done = this.async();

    bower.commands.install()
      .on('log', function(result) {
        grunt.log.ok('bower: ' + result.id + ' ' + result.data.endpoint.name);
      })
      .on('error', grunt.fail.warn.bind(grunt.fail))
      .on('end', done);
  });
};
'use strict';

var fs = require('fs');
var shell = require('shelljs');
var grunt = require('grunt');
var spawn = require('npm-run').spawn;

var CSP_CSS_HEADER = '/* Include this file in your html if you are using the CSP mode. */\n\n';


module.exports = {

  startKarma: function(config, singleRun, done) {
    var browsers = grunt.option('browsers');
    var reporters = grunt.option('reporters');
    var noColor = grunt.option('no-colors');
    var port = grunt.option('port');
    var p = spawn('karma', ['start', config,
      singleRun ? '--single-run=true' : '',
      reporters ? '--reporters=' + reporters : '',
      browsers ? '--browsers=' + browsers : '',
      noColor ? '--no-colors' : '',
      port ? '--port=' + port : ''
    ]);
    p.stdout.pipe(process.stdout);
    p.stderr.pipe(process.stderr);
    p.on('exit', function(code) {
      if (code !== 0) grunt.fail.warn('Karma test(s) failed. Exit code: ' + code);
      done();
    });
  },


  updateWebdriver: function(done) {
    if (process.env.TRAVIS) {
      // Skip the webdriver-manager update on Travis, since the browsers will
      // be provided remotely.
      done();
      return;
    }
    var p = spawn('webdriver-manager', ['update']);
    p.stdout.pipe(process.stdout);
    p.stderr.pipe(process.stderr);
    p.on('exit', function(code) {
      if (code !== 0) grunt.fail.warn('Webdriver failed to update');
      done();
    });
  },

  startProtractor: function(config, done) {
    var sauceUser = grunt.option('sauceUser');
    var sauceKey = grunt.option('sauceKey');
    var tunnelIdentifier = grunt.option('capabilities.tunnel-identifier');
    var sauceBuild = grunt.option('capabilities.build');
    var browser = grunt.option('browser');
    var specs = grunt.option('specs');
    var args = [config];
    if (sauceUser) args.push('--sauceUser=' + sauceUser);
    if (sauceKey) args.push('--sauceKey=' + sauceKey);
    if (tunnelIdentifier) args.push('--capabilities.tunnel-identifier=' + tunnelIdentifier);
    if (sauceBuild) args.push('--capabilities.build=' + sauceBuild);
    if (specs) args.push('--specs=' + specs);
    if (browser) {
      args.push('--browser=' + browser);
    }


    var p = spawn('protractor', args);
    p.stdout.pipe(process.stdout);
    p.stderr.pipe(process.stderr);
    p.on('exit', function(code) {
      if (code !== 0) grunt.fail.warn('Protractor test(s) failed. Exit code: ' + code);
      done();
    });
  },


  wrap: function(src, name) {
    src.unshift('src/' + name + '.prefix');
    src.push('src/' + name + '.suffix');
    return src;
  },


  addStyle: function(src, styles, minify) {
    styles = styles.reduce(processCSS.bind(this), {
      js: [src],
      css: []
    });
    return {
      js: styles.js.join('\n'),
      css: styles.css.join('\n')
    };

    function processCSS(state, file) {
      var css = fs.readFileSync(file).toString(),
        js;
      state.css.push(css);

      if (minify) {
        css = css
          .replace(/\r?\n/g, '')
          .replace(/\/\*.*?\*\//g, '')
          .replace(/:\s+/g, ':')
          .replace(/\s*\{\s*/g, '{')
          .replace(/\s*\}\s*/g, '}')
          .replace(/\s*,\s*/g, ',')
          .replace(/\s*;\s*/g, ';');
      }
      //escape for js
      css = css
        .replace(/\\/g, '\\\\')
        .replace(/'/g, '\\\'')
        .replace(/\r?\n/g, '\\n');
      js = '!window.angular.$$csp().noInlineStyle && window.angular.element(document.head).prepend(\'<style type="text/css">' + css + '</style>\');';
      state.js.push(js);

      return state;
    }
  },


  process: function(src, NG_VERSION, strict) {
    var processed = src
      .replace(/(['"])NG_VERSION_FULL\1/g, NG_VERSION.full)
      .replace(/(['"])NG_VERSION_MAJOR\1/, NG_VERSION.major)
      .replace(/(['"])NG_VERSION_MINOR\1/, NG_VERSION.minor)
      .replace(/(['"])NG_VERSION_DOT\1/, NG_VERSION.patch)
      .replace(/(['"])NG_VERSION_CDN\1/, NG_VERSION.cdn)
      .replace(/(['"])NG_VERSION_CODENAME\1/, NG_VERSION.codeName);
    if (strict !== false) processed = this.singleStrict(processed, '\n\n', true);
    return processed;
  },


  build: function(config, fn) {
    var files = grunt.file.expand(config.src);
    var styles = config.styles;
    var processedStyles;
    //concat
    var src = files.map(function(filepath) {
      return grunt.file.read(filepath);
    }).join(grunt.util.normalizelf('\n'));
    //process
    var processed = this.process(src, grunt.config('NG_VERSION'), config.strict);
    if (styles) {
      processedStyles = this.addStyle(processed, styles.css, styles.minify);
      processed = processedStyles.js;
      if (config.styles.generateCspCssFile) {
        grunt.file.write(removeSuffix(config.dest) + '-csp.css', CSP_CSS_HEADER + processedStyles.css);
      }
    }
    //write
    grunt.file.write(config.dest, processed);
    grunt.log.ok('File ' + config.dest + ' created.');
    fn();

    function removeSuffix(fileName) {
      return fileName.replace(/\.js$/, '');
    }
  },


  singleStrict: function(src, insert) {
    return src
      .replace(/\s*("|')use strict("|');\s*/g, insert) // remove all file-specific strict mode flags
      .replace(/(\(function\([^)]*\)\s*\{)/, '$1\'use strict\';'); // add single strict mode flag
  },


  sourceMap: function(mapFile, fileContents) {
    var sourceMapLine = '//# sourceMappingURL=' + mapFile + '\n';
    return fileContents + sourceMapLine;
  },


  min: function(file, done) {
    var classPathSep = (process.platform === 'win32') ? ';' : ':';
    var minFile = file.replace(/\.js$/, '.min.js');
    var mapFile = minFile + '.map';
    var mapFileName = mapFile.match(/[^/]+$/)[0];
    var errorFileName = file.replace(/\.js$/, '-errors.json');
    var versionNumber = grunt.config('NG_VERSION').full;
    var compilationLevel = (file === 'build/angular-message-format.js') ?
        'ADVANCED_OPTIMIZATIONS' : 'SIMPLE_OPTIMIZATIONS';
    shell.exec(
        'java ' +
            this.java32flags() + ' ' +
            this.memoryRequirement() + ' ' +
            '-cp bower_components/closure-compiler/compiler.jar' + classPathSep +
            'bower_components/ng-closure-runner/ngcompiler.jar ' +
            'org.angularjs.closurerunner.NgClosureRunner ' +
            '--compilation_level ' + compilationLevel + ' ' +
            '--language_in ECMASCRIPT5_STRICT ' +
            '--minerr_pass ' +
            '--minerr_errors ' + errorFileName + ' ' +
            '--minerr_url http://errors.angularjs.org/' + versionNumber + '/ ' +
            '--source_map_format=V3 ' +
            '--create_source_map ' + mapFile + ' ' +
            '--js ' + file + ' ' +
            '--js_output_file ' + minFile,
      function(code) {
        if (code !== 0) grunt.fail.warn('Error minifying ' + file);

        // closure creates the source map relative to build/ folder, we need to strip those references
        grunt.file.write(mapFile, grunt.file.read(mapFile).replace('"file":"build/', '"file":"').
                                                           replace('"sources":["build/','"sources":["'));

        // move add use strict into the closure + add source map pragma
        grunt.file.write(minFile, this.sourceMap(mapFileName, this.singleStrict(grunt.file.read(minFile), '\n')));
        grunt.log.ok(file + ' minified into ' + minFile);
        done();
    }.bind(this));
  },

  memoryRequirement: function() {
    return (process.platform === 'win32') ? '' : '-Xmx2g';
  },


  //returns the 32-bit mode force flags for java compiler if supported, this makes the build much faster
  java32flags: function() {
    if (process.platform === 'win32') return '';
    if (shell.exec('java -version -d32 2>&1', {silent: true}).code !== 0) return '';
    return ' -d32 -client';
  },


  //collects and combines error messages stripped out in minify step
  collectErrors: function() {
    var combined = {
      id: 'ng',
      generated: new Date().toString(),
      errors: {}
    };
    grunt.file.expand('build/*-errors.json').forEach(function(file) {
      var errors = grunt.file.readJSON(file),
        namespace;
      Object.keys(errors).forEach(function(prop) {
        if (typeof errors[prop] === 'object') {
          namespace = errors[prop];
          if (combined.errors[prop]) {
            Object.keys(namespace).forEach(function(code) {
              if (combined.errors[prop][code] && combined.errors[prop][code] !== namespace[code]) {
                grunt.warn('[collect-errors] Duplicate minErr codes don\'t match!');
              } else {
                combined.errors[prop][code] = namespace[code];
              }
            });
          } else {
            combined.errors[prop] = namespace;
          }
        } else {
          if (combined.errors[prop] && combined.errors[prop] !== errors[prop]) {
            grunt.warn('[collect-errors] Duplicate minErr codes don\'t match!');
          } else {
            combined.errors[prop] = errors[prop];
          }
        }
      });
    });
    grunt.file.write('build/errors.json', JSON.stringify(combined));
    grunt.file.expand('build/*-errors.json').forEach(grunt.file.delete);
  },


  //csp connect middleware
  conditionalCsp: function() {
    return function(req, res, next) {
      var CSP = /\.csp\W/;

      if (CSP.test(req.url)) {
        res.setHeader('X-WebKit-CSP', 'default-src \'self\';');
        res.setHeader('X-Content-Security-Policy', 'default-src \'self\'');
        res.setHeader('Content-Security-Policy', 'default-src \'self\'');
      }
      next();
    };
  },


  //rewrite connect middleware
  rewrite: function() {
    return function(req, res, next) {
      var REWRITE = /\/(guide|api|cookbook|misc|tutorial|error).*$/,
          IGNORED = /(\.(css|js|png|jpg|gif|svg)$|partials\/.*\.html$)/,
          match;

      if (!IGNORED.test(req.url) && (match = req.url.match(REWRITE))) {
        console.log('rewriting', req.url);
        req.url = req.url.replace(match[0], '/index.html');
      }
      next();
    };
  }
};
'use strict';

var path = require('path');
var fs = require('fs');
var glob = require('glob');
var _ = require('lodash');
var files = require('../../angularFiles').files;

module.exports = function(grunt) {

  grunt.registerTask('validate-angular-files', function() {
    var combinedFiles = _.clone(files.angularModules);
    combinedFiles.ng = files.angularSrc;
    combinedFiles.angularLoader = files.angularLoader;

    var errorsDetected = false;
    var directories = [];
    var detectedFiles = {};

    for (var section in combinedFiles) {
      var sectionFiles = combinedFiles[section];

      if (section !== 'angularLoader') {
        directories.push('src/' + section);
      }

      grunt.log.debug('Validating ' + sectionFiles.length + ' files from the "' + section + '" module.');

      sectionFiles.forEach(function(file) {
        detectedFiles[file] = true;

        if (!fs.existsSync(file)) {
          grunt.log.error(file + ' does not exist in the local file structure.');
          errorsDetected = true;
        }
      });
    }

    directories.forEach(function(directory) {
      glob.sync(directory + '/**/*').forEach(function(filePath) {
        if (!fs.lstatSync(filePath).isDirectory()) {
          var fileName = path.basename(filePath);
          var isHiddenFile = fileName[0] === '.';
          if (!isHiddenFile && !detectedFiles[filePath]) {
            grunt.log.error(filePath + ' exists in the local file structure but isn\'t used by any module.');
            errorsDetected = true;
          }
        }
      });
    });

    if (errorsDetected) {
      throw new Error('Not all files were properly detected in the local file structure.');
    } else {
      grunt.log.ok('All files were detected successfully!');
    }
  });
};
'use strict';

var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var semver = require('semver');
var _ = require('lodash');

var process = require('process');
// We are only interested in whether this environment variable exists, hence the !!
var NO_REMOTE_REQUESTS = !!process.env['NG1_BUILD_NO_REMOTE_VERSION_REQUESTS'];
var versionSource = NO_REMOTE_REQUESTS ? 'local' : 'remote';

var currentPackage, previousVersions, cdnVersion;


/**
 * Load information about this project from the package.json
 * @return {Object} The package information
 */
var getPackage = function() {
  // Search up the folder hierarchy for the first package.json
  var packageFolder = path.resolve('.');
  while (!fs.existsSync(path.join(packageFolder, 'package.json'))) {
    var parent = path.dirname(packageFolder);
    if (parent === packageFolder) { break; }
    packageFolder = parent;
  }
  return JSON.parse(fs.readFileSync(path.join(packageFolder,'package.json'), 'UTF-8'));
};


/**
 * Parse the github URL for useful information
 * @return {Object} An object containing the github owner and repository name
 */
var getGitRepoInfo = function() {
  var GITURL_REGEX = /^https:\/\/github.com\/([^/]+)\/(.+).git$/;
  var match = GITURL_REGEX.exec(currentPackage.repository.url);
  var git = {
    owner: match[1],
    repo: match[2]
  };
  return git;
};



/**
 * Extract the code name from the tagged commit's message - it should contain the text of the form:
 * "codename(some-code-name)"
 * @param  {String} tagName Name of the tag to look in for the codename
 * @return {String}         The codename if found, otherwise null/undefined
 */
var getCodeName = function(tagName) {
  var gitCatOutput = shell.exec('git cat-file -p ' + tagName, {silent:true}).stdout;
  var tagMessage = gitCatOutput.match(/^.*codename.*$/mg)[0];
  var codeName = tagMessage && tagMessage.match(/codename\((.*)\)/)[1];
  if (!codeName) {
    throw new Error('Could not extract release code name. The message of tag ' + tagName +
      ' must match \'*codename(some release name)*\'');
  }
  return codeName;
};


/**
 * Compute a build segment for the version, from the Jenkins build number and current commit SHA
 * @return {String} The build segment of the version
 */
function getBuild() {
  var hash = shell.exec('git rev-parse --short HEAD', {silent: true}).stdout.replace('\n', '');
  return 'sha.' + hash;
}

function checkBranchPattern(version, branchPattern) {
  // check that the version starts with the branch pattern minus its asterisk
  // e.g. branchPattern = '1.6.*'; version = '1.6.0-rc.0' => '1.6.' === '1.6.'
  return version.slice(0, branchPattern.length - 1) === branchPattern.replace('*', '');
}

/**
 * If the current commit is tagged as a version get that version
 * @return {SemVer} The version or null
 */
var getTaggedVersion = function() {
  var gitTagResult = shell.exec('git describe --exact-match', {silent:true});

  if (gitTagResult.code === 0) {
    var tag = gitTagResult.stdout.trim();
    var version = semver.parse(tag);

    if (version && checkBranchPattern(version.version, currentPackage.branchPattern)) {
      version.codeName = getCodeName(tag);
      version.full = version.version;
      version.branch = 'v' + currentPackage.branchPattern.replace('*', 'x');
      return version;
    }
  }

  return null;
};

/**
 * Get a collection of all the previous versions sorted by semantic version
 * @return {Array.<SemVer>} The collection of previous versions
 */
var getPreviousVersions =  function() {
  // If we are allowing remote requests then use the remote tags as the local clone might
  // not contain all commits when cloned with git clone --depth=...
  // Otherwise just use the tags in the local repository
  var repo_url = currentPackage.repository.url;
  var query = NO_REMOTE_REQUESTS ? 'git tag' : 'git ls-remote --tags ' + repo_url;
  var tagResults = shell.exec(query, {silent: true});
  if (tagResults.code === 0) {
    return _(tagResults.stdout.match(/v[0-9].*[0-9]$/mg))
      .map(function(tag) {
        var version = semver.parse(tag);
        return version;
      })
      .filter()
      .map(function(version) {
        // angular.js didn't follow semantic version until 1.20rc1
        if ((version.major === 1 && version.minor === 0 && version.prerelease.length > 0) || (version.major === 1 && version.minor === 2 && version.prerelease[0] === 'rc1')) {
          version.version = [version.major, version.minor, version.patch].join('.') + version.prerelease.join('');
          version.raw = 'v' + version.version;
        }
        version.docsUrl = 'http://code.angularjs.org/' + version.version + '/docs';
        // Versions before 1.0.2 had a different docs folder name
        if (version.major < 1 || (version.major === 1 && version.minor === 0 && version.patch < 2)) {
          version.docsUrl += '-' + version.version;
          version.isOldDocsUrl = true;
        }
        return version;
      })
      .sort(semver.compare)
      .value();
  } else {
    return [];
  }
};

var getCdnVersion = function() {
  return _(previousVersions)
    .filter(function(tag) {
      return semver.satisfies(tag, currentPackage.branchVersion);
    })
    .reverse()
    .reduce(function(cdnVersion, version) {
      if (!cdnVersion) {
        if (NO_REMOTE_REQUESTS) {
          // We do not want to make any remote calls to the CDN so just use the most recent version
          cdnVersion = version;
        } else {
          // Note: need to use shell.exec and curl here
          // as version-infos returns its result synchronously...
          var cdnResult = shell.exec('curl http://ajax.googleapis.com/ajax/libs/angularjs/' + version + '/angular.min.js ' +
                    '--head --write-out "%{http_code}" -silent',
                                      {silent: true});
          if (cdnResult.code === 0) {
            // --write-out appends its content to the general request response, so extract it
            var statusCode = cdnResult.stdout.split('\n').pop().trim();
            if (statusCode === '200') {
              cdnVersion = version;
            }
          }
        }
      }
      return cdnVersion;
    }, null);
};

/**
 * Get the unstable snapshot version
 * @return {SemVer} The snapshot version
 */
var getSnapshotVersion = function() {
  var version = _(previousVersions)
    .filter(function(tag) {
      return semver.satisfies(tag, currentPackage.branchVersion);
    })
    .last();

  if (!version) {
    // a snapshot version before the first tag on the branch
    version = semver(currentPackage.branchPattern.replace('*','0-beta.1'));
  }

  // We need to clone to ensure that we are not modifying another version
  version = semver(version.raw);

  var jenkinsBuild = process.env.TRAVIS_BUILD_NUMBER || process.env.BUILD_NUMBER;
  if (!version.prerelease || !version.prerelease.length) {
    // last release was a non beta release. Increment the patch level to
    // indicate the next release that we will be doing.
    // E.g. last release was 1.3.0, then the snapshot will be
    // 1.3.1-build.1, which is lesser than 1.3.1 according to the semver!

    // If the last release was a beta release we don't update the
    // beta number by purpose, as otherwise the semver comparison
    // does not work any more when the next beta is released.
    // E.g. don't generate 1.3.0-beta.2.build.1
    // as this is bigger than 1.3.0-beta.2 according to semver
    version.patch++;
  }
  version.prerelease = jenkinsBuild ? ['build', jenkinsBuild] : ['local'];
  version.build = getBuild();
  version.codeName = 'snapshot';
  version.isSnapshot = true;
  version.format();
  version.full = version.version + '+' + version.build;
  version.branch = 'master';

  return version;
};


exports.currentPackage = currentPackage = getPackage();
exports.gitRepoInfo = getGitRepoInfo();
exports.previousVersions = previousVersions = getPreviousVersions();
exports.cdnVersion = cdnVersion = getCdnVersion();
exports.currentVersion = getTaggedVersion() || getSnapshotVersion();

if (NO_REMOTE_REQUESTS) {
  console.log('==============================================================================================');
  console.log('Running with no remote requests for version data:');
  console.log(' - this is due to the "NG1_BUILD_NO_REMOTE_VERSION_REQUESTS" environment variable being defined.');
  console.log(' - be aware that the generated docs may not have valid or the most recent version information.');
  console.log('==============================================================================================');
}

console.log('CDN version (' + versionSource + '):', cdnVersion ? cdnVersion.raw : 'No version found.');
console.log('Current version (' + versionSource + '):', exports.currentVersion.raw);
'use strict';

var angularFiles = require('./angularFiles');
var sharedConfig = require('./karma-shared.conf');

module.exports = function(config) {
  sharedConfig(config, {testName: 'AngularJS: modules', logFile: 'karma-modules.log'});

  config.set({
    files: angularFiles.mergeFilesFor('karmaModules'),

    junitReporter: {
      outputFile: 'test_out/modules.xml',
      suite: 'modules'
    }
  });
};
'use strict';

describe('jqLite', function() {
  var scope, a, b, c, document;

  // Checks if jQuery 2.1 is used.
  function isJQuery21() {
    if (_jqLiteMode) return false;
    var jQueryVersionParts = _jQuery.fn.jquery.split('.');
    return jQueryVersionParts[0] + '.' + jQueryVersionParts[1] === '2.1';
  }

  // Checks if jQuery 2.x is used.
  function isJQuery2x() {
    if (_jqLiteMode) return false;
    var jQueryVersionParts = _jQuery.fn.jquery.split('.');
    return jQueryVersionParts[0] === '2';
  }

  beforeEach(module(provideLog));

  beforeEach(function() {
    a = jqLite('<div>A</div>')[0];
    b = jqLite('<div>B</div>')[0];
    c = jqLite('<div>C</div>')[0];
  });


  beforeEach(inject(function($rootScope) {
    document = window.document;
    scope = $rootScope;
    jasmine.addMatchers({
      toJqEqual: function() {
        return {
          compare: function(_actual_, expected) {
            var msg = 'Unequal length';
            var message = function() {return msg;};

            var value = _actual_ && expected && _actual_.length === expected.length;
            for (var i = 0; value && i < expected.length; i++) {
              var actual = jqLite(_actual_[i])[0];
              var expect = jqLite(expected[i])[0];
              value = value && equals(expect, actual);
              msg = 'Not equal at index: ' + i
                  + ' - Expected: ' + expect
                  + ' - Actual: ' + actual;
            }
            return { pass: value, message: message };
          }
        };
      }
    });
  }));


  afterEach(function() {
    dealoc(a);
    dealoc(b);
    dealoc(c);
  });


  it('should be jqLite when jqLiteMode is on, otherwise jQuery', function() {
    expect(jqLite).toBe(_jqLiteMode ? JQLite : _jQuery);
  });


  describe('construction', function() {
    it('should allow construction with text node', function() {
      var text = a.firstChild;
      var selected = jqLite(text);
      expect(selected.length).toEqual(1);
      expect(selected[0]).toEqual(text);
    });


    it('should allow construction with html', function() {
      var nodes = jqLite('<div>1</div><span>2</span>');
      expect(nodes[0].parentNode).toBeDefined();
      expect(nodes[0].parentNode.nodeType).toBe(11); /** Document Fragment **/
      expect(nodes[0].parentNode).toBe(nodes[1].parentNode);
      expect(nodes.length).toEqual(2);
      expect(nodes[0].innerHTML).toEqual('1');
      expect(nodes[1].innerHTML).toEqual('2');
    });


    it('should allow construction of html with leading whitespace', function() {
      var nodes = jqLite('  \n\r   \r\n<div>1</div><span>2</span>');
      expect(nodes[0].parentNode).toBeDefined();
      expect(nodes[0].parentNode.nodeType).toBe(11); /** Document Fragment **/
      expect(nodes[0].parentNode).toBe(nodes[1].parentNode);
      expect(nodes.length).toBe(2);
      expect(nodes[0].innerHTML).toBe('1');
      expect(nodes[1].innerHTML).toBe('2');
    });


    // This is not working correctly in jQuery prior to v2.2.
    // See https://github.com/jquery/jquery/issues/1987 for details.
    it('should properly handle dash-delimited node names', function() {
      if (isJQuery21()) return;

      var nodeNames = 'thead tbody tfoot colgroup caption tr th td div kung'.split(' ');
      var nodeNamesTested = 0;
      var nodes, customNodeName;

      forEach(nodeNames, function(nodeName) {
        var customNodeName = nodeName + '-foo';
        var nodes = jqLite('<' + customNodeName + '>Hello, world !</' + customNodeName + '>');

        expect(nodes.length).toBe(1);
        expect(nodeName_(nodes)).toBe(customNodeName);
        expect(nodes.html()).toBe('Hello, world !');

        nodeNamesTested++;
      });

      expect(nodeNamesTested).toBe(10);
    });


    it('should allow creation of comment tags', function() {
      var nodes = jqLite('<!-- foo -->');
      expect(nodes.length).toBe(1);
      expect(nodes[0].nodeType).toBe(8);
    });


    it('should allow creation of script tags', function() {
      var nodes = jqLite('<script></script>');
      expect(nodes.length).toBe(1);
      expect(nodes[0].tagName.toUpperCase()).toBe('SCRIPT');
    });


    it('should wrap document fragment', function() {
      var fragment = jqLite(document.createDocumentFragment());
      expect(fragment.length).toBe(1);
      expect(fragment[0].nodeType).toBe(11);
    });


    it('should allow construction of <option> elements', function() {
      var nodes = jqLite('<option>');
      expect(nodes.length).toBe(1);
      expect(nodes[0].nodeName.toLowerCase()).toBe('option');
    });


    // Special tests for the construction of elements which are restricted (in the HTML5 spec) to
    // being children of specific nodes.
    forEach([
      'caption',
      'colgroup',
      'col',
      'optgroup',
      'opt',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'tr'
    ], function(name) {
      it('should allow construction of <$NAME$> elements'.replace('$NAME$', name), function() {
        var nodes = jqLite('<$NAME$>'.replace('$NAME$', name));
        expect(nodes.length).toBe(1);
        expect(nodes[0].nodeName.toLowerCase()).toBe(name);
      });
    });
  });

  describe('_data', function() {
    it('should provide access to the events present on the element', function() {
      var element = jqLite('<i>foo</i>');
      expect(angular.element._data(element[0]).events).toBeUndefined();

      element.on('click', function() { });
      expect(angular.element._data(element[0]).events.click).toBeDefined();
    });
  });

  describe('inheritedData', function() {

    it('should retrieve data attached to the current element', function() {
      var element = jqLite('<i>foo</i>');
      element.data('myData', 'abc');
      expect(element.inheritedData('myData')).toBe('abc');
      dealoc(element);
    });


    it('should walk up the dom to find data', function() {
      var element = jqLite('<ul><li><p><b>deep deep</b><p></li></ul>');
      var deepChild = jqLite(element[0].getElementsByTagName('b')[0]);
      element.data('myData', 'abc');
      expect(deepChild.inheritedData('myData')).toBe('abc');
      dealoc(element);
    });


    it('should return undefined when no data was found', function() {
      var element = jqLite('<ul><li><p><b>deep deep</b><p></li></ul>');
      var deepChild = jqLite(element[0].getElementsByTagName('b')[0]);
      expect(deepChild.inheritedData('myData')).toBeFalsy();
      dealoc(element);
    });


    it('should work with the child html element instead if the current element is the document obj',
      function() {
        var item = {},
            doc = jqLite(document),
            html = doc.find('html');

        html.data('item', item);
        expect(doc.inheritedData('item')).toBe(item);
        expect(html.inheritedData('item')).toBe(item);
        dealoc(doc);
      }
    );

    it('should return null values', function() {
      var ul = jqLite('<ul><li><p><b>deep deep</b><p></li></ul>'),
          li = ul.find('li'),
          b = li.find('b');

      ul.data('foo', 'bar');
      li.data('foo', null);
      expect(b.inheritedData('foo')).toBe(null);
      expect(li.inheritedData('foo')).toBe(null);
      expect(ul.inheritedData('foo')).toBe('bar');

      dealoc(ul);
    });

    it('should pass through DocumentFragment boundaries via host', function() {
      var host = jqLite('<div></div>'),
          frag = document.createDocumentFragment(),
          $frag = jqLite(frag);
      frag.host = host[0];
      host.data('foo', 123);
      host.append($frag);
      expect($frag.inheritedData('foo')).toBe(123);

      dealoc(host);
      dealoc($frag);
    });
  });


  describe('scope', function() {
    it('should retrieve scope attached to the current element', function() {
      var element = jqLite('<i>foo</i>');
      element.data('$scope', scope);
      expect(element.scope()).toBe(scope);
      dealoc(element);
    });

    it('should retrieve isolate scope attached to the current element', function() {
      var element = jqLite('<i>foo</i>');
      element.data('$isolateScope', scope);
      expect(element.isolateScope()).toBe(scope);
      dealoc(element);
    });

    it('should retrieve scope attached to the html element if it\'s requested on the document',
        function() {
      var doc = jqLite(document),
          html = doc.find('html'),
          scope = {};

      html.data('$scope', scope);

      expect(doc.scope()).toBe(scope);
      expect(html.scope()).toBe(scope);
      dealoc(doc);
    });

    it('should walk up the dom to find scope', function() {
      var element = jqLite('<ul><li><p><b>deep deep</b><p></li></ul>');
      var deepChild = jqLite(element[0].getElementsByTagName('b')[0]);
      element.data('$scope', scope);
      expect(deepChild.scope()).toBe(scope);
      dealoc(element);
    });


    it('should return undefined when no scope was found', function() {
      var element = jqLite('<ul><li><p><b>deep deep</b><p></li></ul>');
      var deepChild = jqLite(element[0].getElementsByTagName('b')[0]);
      expect(deepChild.scope()).toBeFalsy();
      dealoc(element);
    });
  });


  describe('isolateScope', function() {

    it('should retrieve isolate scope attached to the current element', function() {
      var element = jqLite('<i>foo</i>');
      element.data('$isolateScope', scope);
      expect(element.isolateScope()).toBe(scope);
      dealoc(element);
    });


    it('should not walk up the dom to find scope', function() {
      var element = jqLite('<ul><li><p><b>deep deep</b><p></li></ul>');
      var deepChild = jqLite(element[0].getElementsByTagName('b')[0]);
      element.data('$isolateScope', scope);
      expect(deepChild.isolateScope()).toBeUndefined();
      dealoc(element);
    });


    it('should return undefined when no scope was found', function() {
      var element = jqLite('<div></div>');
      expect(element.isolateScope()).toBeFalsy();
      dealoc(element);
    });
  });


  describe('injector', function() {
    it('should retrieve injector attached to the current element or its parent', function() {
      var template = jqLite('<div><span></span></div>'),
        span = template.children().eq(0),
        injector = angular.bootstrap(template);


      expect(span.injector()).toBe(injector);
      dealoc(template);
    });


    it('should retrieve injector attached to the html element if it\'s requested on document',
        function() {
      var doc = jqLite(document),
          html = doc.find('html'),
          injector = {};

      html.data('$injector', injector);

      expect(doc.injector()).toBe(injector);
      expect(html.injector()).toBe(injector);
      dealoc(doc);
    });


    it('should do nothing with a noncompiled template', function() {
      var template = jqLite('<div><span></span></div>');
      expect(template.injector()).toBeUndefined();
      dealoc(template);
    });
  });


  describe('controller', function() {
    it('should retrieve controller attached to the current element or its parent', function() {
      var div = jqLite('<div><span></span></div>'),
          span = div.find('span');

      div.data('$ngControllerController', 'ngController');
      span.data('$otherController', 'other');

      expect(span.controller()).toBe('ngController');
      expect(span.controller('ngController')).toBe('ngController');
      expect(span.controller('other')).toBe('other');

      expect(div.controller()).toBe('ngController');
      expect(div.controller('ngController')).toBe('ngController');
      expect(div.controller('other')).toBeUndefined();

      dealoc(div);
    });
  });


  describe('data', function() {
    it('should set and get and remove data', function() {
      var selected = jqLite([a, b, c]);

      expect(selected.data('prop')).toBeUndefined();
      expect(selected.data('prop', 'value')).toBe(selected);
      expect(selected.data('prop')).toBe('value');
      expect(jqLite(a).data('prop')).toBe('value');
      expect(jqLite(b).data('prop')).toBe('value');
      expect(jqLite(c).data('prop')).toBe('value');

      jqLite(a).data('prop', 'new value');
      expect(jqLite(a).data('prop')).toBe('new value');
      expect(selected.data('prop')).toBe('new value');
      expect(jqLite(b).data('prop')).toBe('value');
      expect(jqLite(c).data('prop')).toBe('value');

      expect(selected.removeData('prop')).toBe(selected);
      expect(jqLite(a).data('prop')).toBeUndefined();
      expect(jqLite(b).data('prop')).toBeUndefined();
      expect(jqLite(c).data('prop')).toBeUndefined();
    });

    it('should only remove the specified value when providing a property name to removeData', function() {
      var selected = jqLite(a);

      expect(selected.data('prop1')).toBeUndefined();

      selected.data('prop1', 'value');
      selected.data('prop2', 'doublevalue');

      expect(selected.data('prop1')).toBe('value');
      expect(selected.data('prop2')).toBe('doublevalue');

      selected.removeData('prop1');

      expect(selected.data('prop1')).toBeUndefined();
      expect(selected.data('prop2')).toBe('doublevalue');

      selected.removeData('prop2');
    });


    it('should add and remove data on SVGs', function() {
      var svg = jqLite('<svg><rect></rect></svg>');

      svg.data('svg-level', 1);
      expect(svg.data('svg-level')).toBe(1);

      svg.children().data('rect-level', 2);
      expect(svg.children().data('rect-level')).toBe(2);

      svg.remove();
    });


    it('should not add to the cache if the node is a comment or text node', function() {
      var nodes = jqLite('<!-- some comment --> and some text');
      expect(jqLiteCacheSize()).toEqual(0);
      nodes.data('someKey');
      expect(jqLiteCacheSize()).toEqual(0);
      nodes.data('someKey', 'someValue');
      expect(jqLiteCacheSize()).toEqual(0);
    });


    it('should provide the non-wrapped data calls', function() {
      var node = document.createElement('div');

      expect(jqLite.hasData(node)).toBe(false);
      expect(jqLite.data(node, 'foo')).toBeUndefined();
      expect(jqLite.hasData(node)).toBe(false);

      jqLite.data(node, 'foo', 'bar');

      expect(jqLite.hasData(node)).toBe(true);
      expect(jqLite.data(node, 'foo')).toBe('bar');
      expect(jqLite(node).data('foo')).toBe('bar');

      expect(jqLite.data(node)).toBe(jqLite(node).data());

      jqLite.removeData(node, 'foo');
      expect(jqLite.data(node, 'foo')).toBeUndefined();

      jqLite.data(node, 'bar', 'baz');
      jqLite.removeData(node);
      jqLite.removeData(node);
      expect(jqLite.data(node, 'bar')).toBeUndefined();

      jqLite(node).remove();
      expect(jqLite.hasData(node)).toBe(false);
    });

    it('should emit $destroy event if element removed via remove()', function() {
      var log = '';
      var element = jqLite(a);
      element.on('$destroy', function() {log += 'destroy;';});
      element.remove();
      expect(log).toEqual('destroy;');
    });


    it('should emit $destroy event if an element is removed via html(\'\')', inject(function(log) {
      var element = jqLite('<div><span>x</span></div>');
      element.find('span').on('$destroy', log.fn('destroyed'));

      element.html('');

      expect(element.html()).toBe('');
      expect(log).toEqual('destroyed');
    }));


    it('should emit $destroy event if an element is removed via empty()', inject(function(log) {
      var element = jqLite('<div><span>x</span></div>');
      element.find('span').on('$destroy', log.fn('destroyed'));

      element.empty();

      expect(element.html()).toBe('');
      expect(log).toEqual('destroyed');
    }));


    it('should keep data if an element is removed via detach()', function() {
      var root = jqLite('<div><span>abc</span></div>'),
          span = root.find('span'),
          data = span.data();

      span.data('foo', 'bar');
      span.detach();

      expect(data).toEqual({foo: 'bar'});

      span.remove();
    });


    it('should retrieve all data if called without params', function() {
      var element = jqLite(a);
      expect(element.data()).toEqual({});

      element.data('foo', 'bar');
      expect(element.data()).toEqual({foo: 'bar'});

      element.data().baz = 'xxx';
      expect(element.data()).toEqual({foo: 'bar', baz: 'xxx'});
    });

    it('should create a new data object if called without args', function() {
      var element = jqLite(a),
          data = element.data();

      expect(data).toEqual({});
      element.data('foo', 'bar');
      expect(data).toEqual({foo: 'bar'});
    });

    it('should create a new data object if called with a single object arg', function() {
      var element = jqLite(a),
          newData = {foo: 'bar'};

      element.data(newData);
      expect(element.data()).toEqual({foo: 'bar'});
      expect(element.data()).not.toBe(newData); // create a copy
    });

    it('should merge existing data object with a new one if called with a single object arg',
        function() {
      var element = jqLite(a);
      element.data('existing', 'val');
      expect(element.data()).toEqual({existing: 'val'});

      var oldData = element.data(),
          newData = {meLike: 'turtles', 'youLike': 'carrots'};

      expect(element.data(newData)).toBe(element);
      expect(element.data()).toEqual({meLike: 'turtles', youLike: 'carrots', existing: 'val'});
      expect(element.data()).toBe(oldData); // merge into the old object
    });

    describe('data cleanup', function() {
      it('should remove data on element removal', function() {
        var div = jqLite('<div><span>text</span></div>'),
            span = div.find('span');

        span.data('name', 'AngularJS');
        span.remove();
        expect(span.data('name')).toBeUndefined();
      });

      it('should remove event listeners on element removal', function() {
        var div = jqLite('<div><span>text</span></div>'),
            span = div.find('span'),
            log = '';

        span.on('click', function() { log += 'click;'; });
        browserTrigger(span);
        expect(log).toEqual('click;');

        span.remove();

        browserTrigger(span);
        expect(log).toEqual('click;');
      });

      it('should work if the descendants of the element change while it\'s being removed', function() {
        var div = jqLite('<div><p><span>text</span></p></div>');
        div.find('p').on('$destroy', function() {
          div.find('span').remove();
        });
        expect(function() {
          div.remove();
        }).not.toThrow();
      });
    });

    describe('camelCasing keys', function() {
      // jQuery 2.x has different behavior; skip the tests.
      if (isJQuery2x()) return;

      it('should camelCase the key in a setter', function() {
        var element = jqLite(a);

        element.data('a-B-c-d-42--e', 'z-x');
        expect(element.data()).toEqual({'a-BCD-42-E': 'z-x'});
      });

      it('should camelCase the key in a getter', function() {
        var element = jqLite(a);

        element.data()['a-BCD-42-E'] = 'x-c';
        expect(element.data('a-B-c-d-42--e')).toBe('x-c');
      });

      it('should camelCase the key in a mass setter', function() {
        var element = jqLite(a);

        element.data({'a-B-c-d-42--e': 'c-v', 'r-t-v': 42});
        expect(element.data()).toEqual({'a-BCD-42-E': 'c-v', 'rTV': 42});
      });

      it('should ignore non-camelCase keys in the data in a getter', function() {
        var element = jqLite(a);

        element.data()['a-b'] = 'b-n';
        expect(element.data('a-b')).toBe(undefined);
      });
    });
  });


  describe('attr', function() {
    it('should read, write and remove attr', function() {
      var selector = jqLite([a, b]);

      expect(selector.attr('prop', 'value')).toEqual(selector);
      expect(jqLite(a).attr('prop')).toEqual('value');
      expect(jqLite(b).attr('prop')).toEqual('value');

      expect(selector.attr({'prop': 'new value'})).toEqual(selector);
      expect(jqLite(a).attr('prop')).toEqual('new value');
      expect(jqLite(b).attr('prop')).toEqual('new value');

      jqLite(b).attr({'prop': 'new value 2'});
      expect(jqLite(selector).attr('prop')).toEqual('new value');
      expect(jqLite(b).attr('prop')).toEqual('new value 2');

      selector.removeAttr('prop');
      expect(jqLite(a).attr('prop')).toBeFalsy();
      expect(jqLite(b).attr('prop')).toBeFalsy();
    });

    it('should read boolean attributes as strings', function() {
      var select = jqLite('<select>');
      expect(select.attr('multiple')).toBeUndefined();
      expect(jqLite('<select multiple>').attr('multiple')).toBe('multiple');
      expect(jqLite('<select multiple="">').attr('multiple')).toBe('multiple');
      expect(jqLite('<select multiple="x">').attr('multiple')).toBe('multiple');
    });

    it('should add/remove boolean attributes', function() {
      var select = jqLite('<select>');
      select.attr('multiple', false);
      expect(select.attr('multiple')).toBeUndefined();

      select.attr('multiple', true);
      expect(select.attr('multiple')).toBe('multiple');
    });

    it('should not take properties into account when getting respective boolean attributes', function() {
      // Use a div and not a select as the latter would itself reflect the multiple attribute
      // to a property.
      var div = jqLite('<div>');

      div[0].multiple = true;
      expect(div.attr('multiple')).toBe(undefined);

      div.attr('multiple', 'multiple');
      div[0].multiple = false;
      expect(div.attr('multiple')).toBe('multiple');
    });

    it('should not set properties when setting respective boolean attributes', function() {
      // jQuery 2.x has different behavior; skip the test.
      if (isJQuery2x()) return;

      // Use a div and not a select as the latter would itself reflect the multiple attribute
      // to a property.
      var div = jqLite('<div>');

      // Check the initial state.
      expect(div[0].multiple).toBe(undefined);

      div.attr('multiple', 'multiple');
      expect(div[0].multiple).toBe(undefined);

      div.attr('multiple', '');
      expect(div[0].multiple).toBe(undefined);

      div.attr('multiple', false);
      expect(div[0].multiple).toBe(undefined);

      div.attr('multiple', null);
      expect(div[0].multiple).toBe(undefined);
    });

    it('should normalize the case of boolean attributes', function() {
      var input = jqLite('<input readonly>');
      expect(input.attr('readonly')).toBe('readonly');
      expect(input.attr('readOnly')).toBe('readonly');
      expect(input.attr('READONLY')).toBe('readonly');

      input.attr('readonly', false);
      expect(input[0].getAttribute('readonly')).toBe(null);

      input.attr('readOnly', 'READonly');
      expect(input.attr('readonly')).toBe('readonly');
      expect(input.attr('readOnly')).toBe('readonly');
    });

    it('should return undefined for non-existing attributes', function() {
      var elm = jqLite('<div class="any">a</div>');
      expect(elm.attr('non-existing')).toBeUndefined();
    });

    it('should return undefined for non-existing attributes on input', function() {
      var elm = jqLite('<input>');
      expect(elm.attr('readonly')).toBeUndefined();
      expect(elm.attr('readOnly')).toBeUndefined();
      expect(elm.attr('disabled')).toBeUndefined();
    });

    it('should do nothing when setting or getting on attribute nodes', function() {
      var attrNode = jqLite(document.createAttribute('myattr'));
      expect(attrNode).toBeDefined();
      expect(attrNode[0].nodeType).toEqual(2);
      expect(attrNode.attr('some-attribute','somevalue')).toEqual(attrNode);
      expect(attrNode.attr('some-attribute')).toBeUndefined();
    });

    it('should do nothing when setting or getting on text nodes', function() {
      var textNode = jqLite(document.createTextNode('some text'));
      expect(textNode).toBeDefined();
      expect(textNode[0].nodeType).toEqual(3);
      expect(textNode.attr('some-attribute','somevalue')).toEqual(textNode);
      expect(textNode.attr('some-attribute')).toBeUndefined();
    });

    it('should do nothing when setting or getting on comment nodes', function() {
      var comment = jqLite(document.createComment('some comment'));
      expect(comment).toBeDefined();
      expect(comment[0].nodeType).toEqual(8);
      expect(comment.attr('some-attribute','somevalue')).toEqual(comment);
      expect(comment.attr('some-attribute')).toBeUndefined();
    });

    it('should remove the attribute for a null value', function() {
      var elm = jqLite('<div attribute="value">a</div>');
      elm.attr('attribute', null);
      expect(elm[0].hasAttribute('attribute')).toBe(false);
    });

    it('should not remove the attribute for an empty string as a value', function() {
      var elm = jqLite('<div attribute="value">a</div>');
      elm.attr('attribute', '');
      expect(elm[0].getAttribute('attribute')).toBe('');
    });

    it('should remove the boolean attribute for a false value', function() {
      var elm = jqLite('<select multiple>');
      elm.attr('multiple', false);
      expect(elm[0].hasAttribute('multiple')).toBe(false);
    });

    it('should remove the boolean attribute for a null value', function() {
      var elm = jqLite('<select multiple>');
      elm.attr('multiple', null);
      expect(elm[0].hasAttribute('multiple')).toBe(false);
    });

    it('should not remove the boolean attribute for an empty string as a value', function() {
      var elm = jqLite('<select multiple>');
      elm.attr('multiple', '');
      expect(elm[0].getAttribute('multiple')).toBe('multiple');
    });

    it('should not fail on elements without the getAttribute method', function() {
      forEach([window, document], function(node) {
        expect(function() {
          var elem = jqLite(node);
          elem.attr('foo');
          elem.attr('bar', 'baz');
          elem.attr('bar');
        }).not.toThrow();
      });
    });
  });


  describe('prop', function() {
    it('should read element property', function() {
      var elm = jqLite('<div class="foo">a</div>');
      expect(elm.prop('className')).toBe('foo');
    });

    it('should set element property to a value', function() {
      var elm = jqLite('<div class="foo">a</div>');
      elm.prop('className', 'bar');
      expect(elm[0].className).toBe('bar');
      expect(elm.prop('className')).toBe('bar');
    });

    it('should set boolean element property', function() {
      var elm = jqLite('<input type="checkbox">');
      expect(elm.prop('checked')).toBe(false);

      elm.prop('checked', true);
      expect(elm.prop('checked')).toBe(true);

      elm.prop('checked', '');
      expect(elm.prop('checked')).toBe(false);

      elm.prop('checked', 'lala');
      expect(elm.prop('checked')).toBe(true);

      elm.prop('checked', null);
      expect(elm.prop('checked')).toBe(false);
    });
  });


  describe('class', function() {

    it('should properly do  with SVG elements', function() {
      // This is not working correctly in jQuery prior to v2.2.
      // See https://github.com/jquery/jquery/issues/2199 for details.
      if (isJQuery21()) return;

      var svg = jqLite('<svg><rect></rect></svg>');
      var rect = svg.children();

      expect(rect.hasClass('foo-class')).toBe(false);
      rect.addClass('foo-class');
      expect(rect.hasClass('foo-class')).toBe(true);
      rect.removeClass('foo-class');
      expect(rect.hasClass('foo-class')).toBe(false);
    });


    it('should ignore comment elements', function() {
      var comment = jqLite(document.createComment('something'));

      comment.addClass('whatever');
      comment.hasClass('whatever');
      comment.toggleClass('whatever');
      comment.removeClass('whatever');
    });


    describe('hasClass', function() {
      it('should check class', function() {
        var selector = jqLite([a, b]);
        expect(selector.hasClass('abc')).toEqual(false);
      });


      it('should make sure that partial class is not checked as a subset', function() {
        var selector = jqLite([a, b]);
        selector.addClass('a');
        selector.addClass('b');
        selector.addClass('c');
        expect(selector.addClass('abc')).toEqual(selector);
        expect(selector.removeClass('abc')).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(false);
        expect(jqLite(b).hasClass('abc')).toEqual(false);
        expect(jqLite(a).hasClass('a')).toEqual(true);
        expect(jqLite(a).hasClass('b')).toEqual(true);
        expect(jqLite(a).hasClass('c')).toEqual(true);
      });
    });


    describe('addClass', function() {
      it('should allow adding of class', function() {
        var selector = jqLite([a, b]);
        expect(selector.addClass('abc')).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(true);
        expect(jqLite(b).hasClass('abc')).toEqual(true);
      });


      it('should ignore falsy values', function() {
        var jqA = jqLite(a);
        expect(jqA[0].className).toBe('');

        jqA.addClass(undefined);
        expect(jqA[0].className).toBe('');

        jqA.addClass(null);
        expect(jqA[0].className).toBe('');

        jqA.addClass(false);
        expect(jqA[0].className).toBe('');
      });


      it('should allow multiple classes to be added in a single string', function() {
        var jqA = jqLite(a);
        expect(a.className).toBe('');

        jqA.addClass('foo bar baz');
        expect(a.className).toBe('foo bar baz');
      });


      // JQLite specific implementation/performance tests
      if (_jqLiteMode) {
        it('should only get/set the attribute once when multiple classes added', function() {
          var fakeElement = {
            nodeType: 1,
            setAttribute: jasmine.createSpy(),
            getAttribute: jasmine.createSpy().and.returnValue('')
          };
          var jqA = jqLite(fakeElement);

          jqA.addClass('foo bar baz');
          expect(fakeElement.getAttribute).toHaveBeenCalledOnceWith('class');
          expect(fakeElement.setAttribute).toHaveBeenCalledOnceWith('class', 'foo bar baz');
        });


        it('should not set the attribute when classes not changed', function() {
          var fakeElement = {
            nodeType: 1,
            setAttribute: jasmine.createSpy(),
            getAttribute: jasmine.createSpy().and.returnValue('foo bar')
          };
          var jqA = jqLite(fakeElement);

          jqA.addClass('foo');
          expect(fakeElement.getAttribute).toHaveBeenCalledOnceWith('class');
          expect(fakeElement.setAttribute).not.toHaveBeenCalled();
        });
      }


      it('should not add duplicate classes', function() {
        var jqA = jqLite(a);
        expect(a.className).toBe('');

        a.className = 'foo';
        jqA.addClass('foo');
        expect(a.className).toBe('foo');

        jqA.addClass('bar foo baz');
        expect(a.className).toBe('foo bar baz');
      });
    });


    describe('toggleClass', function() {
      it('should allow toggling of class', function() {
        var selector = jqLite([a, b]);
        expect(selector.toggleClass('abc')).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(true);
        expect(jqLite(b).hasClass('abc')).toEqual(true);

        expect(selector.toggleClass('abc')).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(false);
        expect(jqLite(b).hasClass('abc')).toEqual(false);

        expect(selector.toggleClass('abc'), true).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(true);
        expect(jqLite(b).hasClass('abc')).toEqual(true);

        expect(selector.toggleClass('abc'), false).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(false);
        expect(jqLite(b).hasClass('abc')).toEqual(false);

      });

      it('should allow toggling multiple classes without a condition', function() {
        var selector = jqLite([a, b]);
        expect(selector.toggleClass('abc cde')).toBe(selector);
        expect(jqLite(a).hasClass('abc')).toBe(true);
        expect(jqLite(a).hasClass('cde')).toBe(true);
        expect(jqLite(b).hasClass('abc')).toBe(true);
        expect(jqLite(b).hasClass('cde')).toBe(true);

        expect(selector.toggleClass('abc cde')).toBe(selector);
        expect(jqLite(a).hasClass('abc')).toBe(false);
        expect(jqLite(a).hasClass('cde')).toBe(false);
        expect(jqLite(b).hasClass('abc')).toBe(false);
        expect(jqLite(b).hasClass('cde')).toBe(false);

        expect(selector.toggleClass('abc')).toBe(selector);
        expect(selector.toggleClass('abc cde')).toBe(selector);
        expect(jqLite(a).hasClass('abc')).toBe(false);
        expect(jqLite(a).hasClass('cde')).toBe(true);
        expect(jqLite(b).hasClass('abc')).toBe(false);
        expect(jqLite(b).hasClass('cde')).toBe(true);

        expect(selector.toggleClass('abc cde')).toBe(selector);
        expect(jqLite(a).hasClass('abc')).toBe(true);
        expect(jqLite(a).hasClass('cde')).toBe(false);
        expect(jqLite(b).hasClass('abc')).toBe(true);
        expect(jqLite(b).hasClass('cde')).toBe(false);
      });

      it('should allow toggling multiple classes with a condition', function() {
        var selector = jqLite([a, b]);
        selector.addClass('abc');
        expect(selector.toggleClass('abc cde', true)).toBe(selector);
        expect(jqLite(a).hasClass('abc')).toBe(true);
        expect(jqLite(a).hasClass('cde')).toBe(true);
        expect(jqLite(b).hasClass('abc')).toBe(true);
        expect(jqLite(b).hasClass('cde')).toBe(true);

        selector.removeClass('abc');
        expect(selector.toggleClass('abc cde', false)).toBe(selector);
        expect(jqLite(a).hasClass('abc')).toBe(false);
        expect(jqLite(a).hasClass('cde')).toBe(false);
        expect(jqLite(b).hasClass('abc')).toBe(false);
        expect(jqLite(b).hasClass('cde')).toBe(false);
      });

      it('should not break for null / undefined selectors', function() {
        var selector = jqLite([a, b]);
        expect(selector.toggleClass(null)).toBe(selector);
        expect(selector.toggleClass(undefined)).toBe(selector);
      });
    });


    describe('removeClass', function() {
      it('should allow removal of class', function() {
        var selector = jqLite([a, b]);
        expect(selector.addClass('abc')).toEqual(selector);
        expect(selector.removeClass('abc')).toEqual(selector);
        expect(jqLite(a).hasClass('abc')).toEqual(false);
        expect(jqLite(b).hasClass('abc')).toEqual(false);
      });


      it('should correctly remove middle class', function() {
        var element = jqLite('<div class="foo bar baz"></div>');
        expect(element.hasClass('bar')).toBe(true);

        element.removeClass('bar');

        expect(element.hasClass('foo')).toBe(true);
        expect(element.hasClass('bar')).toBe(false);
        expect(element.hasClass('baz')).toBe(true);
      });


      it('should remove multiple classes specified as one string', function() {
        var jqA = jqLite(a);

        a.className = 'foo bar baz';
        jqA.removeClass('foo baz noexistent');
        expect(a.className).toBe('bar');
      });


      // JQLite specific implementation/performance tests
      if (_jqLiteMode) {
        it('should get/set the attribute once when removing multiple classes', function() {
          var fakeElement = {
            nodeType: 1,
            setAttribute: jasmine.createSpy(),
            getAttribute: jasmine.createSpy().and.returnValue('foo bar baz')
          };
          var jqA = jqLite(fakeElement);

          jqA.removeClass('foo baz noexistent');
          expect(fakeElement.getAttribute).toHaveBeenCalledOnceWith('class');
          expect(fakeElement.setAttribute).toHaveBeenCalledOnceWith('class', 'bar');
        });


        it('should not set the attribute when classes not changed', function() {
          var fakeElement = {
            nodeType: 1,
            setAttribute: jasmine.createSpy(),
            getAttribute: jasmine.createSpy().and.returnValue('foo bar')
          };
          var jqA = jqLite(fakeElement);

          jqA.removeClass('noexistent');
          expect(fakeElement.getAttribute).toHaveBeenCalledOnceWith('class');
          expect(fakeElement.setAttribute).not.toHaveBeenCalled();
        });
      }
    });
  });


  describe('css', function() {
    it('should set and read css', function() {
      var selector = jqLite([a, b]);

      expect(selector.css('margin', '1px')).toEqual(selector);
      expect(jqLite(a).css('margin')).toEqual('1px');
      expect(jqLite(b).css('margin')).toEqual('1px');

      expect(selector.css({'margin': '2px'})).toEqual(selector);
      expect(jqLite(a).css('margin')).toEqual('2px');
      expect(jqLite(b).css('margin')).toEqual('2px');

      jqLite(b).css({'margin': '3px'});
      expect(jqLite(selector).css('margin')).toEqual('2px');
      expect(jqLite(a).css('margin')).toEqual('2px');
      expect(jqLite(b).css('margin')).toEqual('3px');

      selector.css('margin', '');
      expect(jqLite(a).css('margin')).toBeFalsy();
      expect(jqLite(b).css('margin')).toBeFalsy();
    });


    it('should set a bunch of css properties specified via an object', function() {
      expect(jqLite(a).css('margin')).toBeFalsy();
      expect(jqLite(a).css('padding')).toBeFalsy();
      expect(jqLite(a).css('border')).toBeFalsy();

      jqLite(a).css({'margin': '1px', 'padding': '2px', 'border': ''});

      expect(jqLite(a).css('margin')).toBe('1px');
      expect(jqLite(a).css('padding')).toBe('2px');
      expect(jqLite(a).css('border')).toBeFalsy();
    });


    it('should correctly handle dash-separated and camelCased properties', function() {
      var jqA = jqLite(a);

      expect(jqA.css('z-index')).toBeOneOf('', 'auto');
      expect(jqA.css('zIndex')).toBeOneOf('', 'auto');


      jqA.css({'zIndex':5});

      expect(jqA.css('z-index')).toBeOneOf('5', 5);
      expect(jqA.css('zIndex')).toBeOneOf('5', 5);

      jqA.css({'z-index':7});

      expect(jqA.css('z-index')).toBeOneOf('7', 7);
      expect(jqA.css('zIndex')).toBeOneOf('7', 7);
    });

    it('should leave non-dashed strings alone', function() {
      var jqA = jqLite(a);

      jqA.css('foo', 'foo');
      jqA.css('fooBar', 'bar');

      expect(a.style.foo).toBe('foo');
      expect(a.style.fooBar).toBe('bar');
    });

    it('should convert dash-separated strings to camelCase', function() {
      var jqA = jqLite(a);

      jqA.css('foo-bar', 'foo');
      jqA.css('foo-bar-baz', 'bar');
      jqA.css('foo:bar_baz', 'baz');

      expect(a.style.fooBar).toBe('foo');
      expect(a.style.fooBarBaz).toBe('bar');
      expect(a.style['foo:bar_baz']).toBe('baz');
    });

    it('should convert leading dashes followed by a lowercase letter', function() {
      var jqA = jqLite(a);

      jqA.css('-foo-bar', 'foo');

      expect(a.style.FooBar).toBe('foo');
    });

    it('should not convert slashes followed by a non-letter', function() {
      // jQuery 2.x had different behavior; skip the test.
      if (isJQuery2x()) return;

      var jqA = jqLite(a);

      jqA.css('foo-42- -a-B', 'foo');

      expect(a.style['foo-42- A-B']).toBe('foo');
    });

    it('should convert the -ms- prefix to ms instead of Ms', function() {
      var jqA = jqLite(a);

      jqA.css('-ms-foo-bar', 'foo');
      jqA.css('-moz-foo-bar', 'bar');
      jqA.css('-webkit-foo-bar', 'baz');

      expect(a.style.msFooBar).toBe('foo');
      expect(a.style.MozFooBar).toBe('bar');
      expect(a.style.WebkitFooBar).toBe('baz');
    });

    it('should not collapse sequences of dashes', function() {
      var jqA = jqLite(a);

      jqA.css('foo---bar-baz--qaz', 'foo');

      expect(a.style['foo--BarBaz-Qaz']).toBe('foo');
    });


    it('should read vendor prefixes with the special -ms- exception', function() {
      // jQuery uses getComputedStyle() in a css getter so these tests would fail there.
      if (!_jqLiteMode) return;

      var jqA = jqLite(a);

      a.style.WebkitFooBar = 'webkit-uppercase';
      a.style.webkitFooBar = 'webkit-lowercase';

      a.style.MozFooBaz = 'moz-uppercase';
      a.style.mozFooBaz = 'moz-lowercase';

      a.style.MsFooQaz = 'ms-uppercase';
      a.style.msFooQaz = 'ms-lowercase';

      expect(jqA.css('-webkit-foo-bar')).toBe('webkit-uppercase');
      expect(jqA.css('-moz-foo-baz')).toBe('moz-uppercase');
      expect(jqA.css('-ms-foo-qaz')).toBe('ms-lowercase');
    });

    it('should write vendor prefixes with the special -ms- exception', function() {
      var jqA = jqLite(a);

      jqA.css('-webkit-foo-bar', 'webkit');
      jqA.css('-moz-foo-baz', 'moz');
      jqA.css('-ms-foo-qaz', 'ms');

      expect(a.style.WebkitFooBar).toBe('webkit');
      expect(a.style.webkitFooBar).not.toBeDefined();

      expect(a.style.MozFooBaz).toBe('moz');
      expect(a.style.mozFooBaz).not.toBeDefined();

      expect(a.style.MsFooQaz).not.toBeDefined();
      expect(a.style.msFooQaz).toBe('ms');
    });
  });


  describe('text', function() {
    it('should return `""` on empty', function() {
      expect(jqLite().length).toEqual(0);
      expect(jqLite().text()).toEqual('');
    });


    it('should read/write value', function() {
      var element = jqLite('<div>ab</div><span>c</span>');
      expect(element.length).toEqual(2);
      expect(element[0].innerHTML).toEqual('ab');
      expect(element[1].innerHTML).toEqual('c');
      expect(element.text()).toEqual('abc');
      expect(element.text('xyz') === element).toBeTruthy();
      expect(element.text()).toEqual('xyzxyz');
    });

    it('should return text only for element or text nodes', function() {
      expect(jqLite('<div>foo</div>').text()).toBe('foo');
      expect(jqLite('<div>foo</div>').contents().eq(0).text()).toBe('foo');
      expect(jqLite(document.createComment('foo')).text()).toBe('');
    });
  });


  describe('val', function() {
    it('should read, write value', function() {
      var input = jqLite('<input type="text"/>');
      expect(input.val('abc')).toEqual(input);
      expect(input[0].value).toEqual('abc');
      expect(input.val()).toEqual('abc');
    });

    it('should get an array of selected elements from a multi select', function() {
      expect(jqLite(
        '<select multiple>' +
          '<option selected>test 1</option>' +
          '<option selected>test 2</option>' +
        '</select>').val()).toEqual(['test 1', 'test 2']);

      expect(jqLite(
        '<select multiple>' +
          '<option selected>test 1</option>' +
          '<option>test 2</option>' +
        '</select>').val()).toEqual(['test 1']);

      // In jQuery < 3.0 .val() on select[multiple] with no selected options returns an
      // null instead of an empty array.
      expect(jqLite(
        '<select multiple>' +
          '<option>test 1</option>' +
          '<option>test 2</option>' +
        '</select>').val()).toEqualOneOf(null, []);
    });

    it('should get an empty array from a multi select if no elements are chosen', function() {
      // In jQuery < 3.0 .val() on select[multiple] with no selected options returns an
      // null instead of an empty array.
      // See https://github.com/jquery/jquery/issues/2562 for more details.
      if (isJQuery2x()) return;

      expect(jqLite(
        '<select multiple>' +
          '<optgroup>' +
            '<option>test 1</option>' +
            '<option>test 2</option>' +
          '</optgroup>' +
          '<option>test 3</option>' +
        '</select>').val()).toEqual([]);

      expect(jqLite(
        '<select multiple>' +
          '<optgroup disabled>' +
            '<option>test 1</option>' +
            '<option>test 2</option>' +
          '</optgroup>' +
          '<option disabled>test 3</option>' +
        '</select>').val()).toEqual([]);
    });
  });


  describe('html', function() {
    it('should return `undefined` on empty', function() {
      expect(jqLite().length).toEqual(0);
      expect(jqLite().html()).toEqual(undefined);
    });


    it('should read/write a value', function() {
      var element = jqLite('<div>abc</div>');
      expect(element.length).toEqual(1);
      expect(element[0].innerHTML).toEqual('abc');
      expect(element.html()).toEqual('abc');
      expect(element.html('xyz') === element).toBeTruthy();
      expect(element.html()).toEqual('xyz');
    });
  });


  describe('empty', function() {
    it('should write a value', function() {
      var element = jqLite('<div>abc</div>');
      expect(element.length).toEqual(1);
      expect(element.empty() === element).toBeTruthy();
      expect(element.html()).toEqual('');
    });
  });


  describe('on', function() {
    it('should bind to window on hashchange', function() {
      if (!_jqLiteMode) return; // don't run in jQuery

      var eventFn;
      var window = {
        document: {},
        location: {},
        alert: noop,
        setInterval: noop,
        length:10, // pretend you are an array
        addEventListener: function(type, fn) {
          expect(type).toEqual('hashchange');
          eventFn = fn;
        },
        removeEventListener: noop
      };
      window.window = window;

      var log;
      var jWindow = jqLite(window).on('hashchange', function() {
        log = 'works!';
      });
      eventFn({type: 'hashchange'});
      expect(log).toEqual('works!');
      dealoc(jWindow);
    });


    it('should bind to all elements and return functions', function() {
      var selected = jqLite([a, b]);
      var log = '';
      expect(selected.on('click', function() {
        log += 'click on: ' + jqLite(this).text() + ';';
      })).toEqual(selected);
      browserTrigger(a, 'click');
      expect(log).toEqual('click on: A;');
      browserTrigger(b, 'click');
      expect(log).toEqual('click on: A;click on: B;');
    });

    it('should not bind to comment or text nodes', function() {
      var nodes = jqLite('<!-- some comment -->Some text');
      var someEventHandler = jasmine.createSpy('someEventHandler');

      nodes.on('someEvent', someEventHandler);
      nodes.triggerHandler('someEvent');

      expect(someEventHandler).not.toHaveBeenCalled();
    });

    it('should bind to all events separated by space', function() {
      var elm = jqLite(a),
          callback = jasmine.createSpy('callback');

      elm.on('click keypress', callback);
      elm.on('click', callback);

      browserTrigger(a, 'click');
      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(2);

      callback.calls.reset();
      browserTrigger(a, 'keypress');
      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should set event.target', function() {
      var elm = jqLite(a);
      elm.on('click', function(event) {
        expect(event.target).toBe(a);
      });

      browserTrigger(a, 'click');
    });

    it('should have event.isDefaultPrevented method', function() {
      var element = jqLite(a),
          clickSpy = jasmine.createSpy('clickSpy');

      clickSpy.and.callFake(function(e) {
        expect(function() {
          expect(e.isDefaultPrevented()).toBe(false);
          e.preventDefault();
          expect(e.isDefaultPrevented()).toBe(true);
        }).not.toThrow();
      });

      element.on('click', clickSpy);

      browserTrigger(a, 'click');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should stop triggering handlers when stopImmediatePropagation is called', function() {
      var element = jqLite(a),
          clickSpy1 = jasmine.createSpy('clickSpy1'),
          clickSpy2 = jasmine.createSpy('clickSpy2').and.callFake(function(event) { event.stopImmediatePropagation(); }),
          clickSpy3 = jasmine.createSpy('clickSpy3'),
          clickSpy4 = jasmine.createSpy('clickSpy4');

      element.on('click', clickSpy1);
      element.on('click', clickSpy2);
      element.on('click', clickSpy3);
      element[0].addEventListener('click', clickSpy4);

      browserTrigger(element, 'click');

      expect(clickSpy1).toHaveBeenCalled();
      expect(clickSpy2).toHaveBeenCalled();
      expect(clickSpy3).not.toHaveBeenCalled();
      expect(clickSpy4).not.toHaveBeenCalled();
    });

    it('should execute stopPropagation when stopImmediatePropagation is called', function() {
      var element = jqLite(a),
          clickSpy = jasmine.createSpy('clickSpy');

      clickSpy.and.callFake(function(event) {
          spyOn(event, 'stopPropagation');
          event.stopImmediatePropagation();
          expect(event.stopPropagation).toHaveBeenCalled();
      });

      element.on('click', clickSpy);

      browserTrigger(element, 'click');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should have event.isImmediatePropagationStopped method', function() {
      var element = jqLite(a),
          clickSpy = jasmine.createSpy('clickSpy');

      clickSpy.and.callFake(function(event) {
          expect(event.isImmediatePropagationStopped()).toBe(false);
          event.stopImmediatePropagation();
          expect(event.isImmediatePropagationStopped()).toBe(true);
      });

      element.on('click', clickSpy);

      browserTrigger(element, 'click');
      expect(clickSpy).toHaveBeenCalled();
    });

    describe('mouseenter-mouseleave', function() {
      var root, parent, child, log;

      function setup(html, parentNode, childNode) {
        log = '';
        root = jqLite(html);
        parent = root.find(parentNode);
        child = parent.find(childNode);

        parent.on('mouseenter', function() { log += 'parentEnter;'; });
        parent.on('mouseleave', function() { log += 'parentLeave;'; });

        child.on('mouseenter', function() { log += 'childEnter;'; });
        child.on('mouseleave', function() { log += 'childLeave;'; });
      }

      function browserMoveTrigger(from, to) {
        var fireEvent = function(type, element, relatedTarget) {
          var evnt;
          evnt = document.createEvent('MouseEvents');

          var originalPreventDefault = evnt.preventDefault,
          appWindow = window,
          fakeProcessDefault = true,
          finalProcessDefault;

          evnt.preventDefault = function() {
            fakeProcessDefault = false;
            return originalPreventDefault.apply(evnt, arguments);
          };

          var x = 0, y = 0;
          evnt.initMouseEvent(type, true, true, window, 0, x, y, x, y, false, false,
          false, false, 0, relatedTarget);

          element.dispatchEvent(evnt);
        };
        fireEvent('mouseout', from[0], to[0]);
        fireEvent('mouseover', to[0], from[0]);
      }

      afterEach(function() {
        dealoc(root);
      });

      it('should fire mouseenter when coming from outside the browser window', function() {
        if (!_jqLiteMode) return;

        setup('<div>root<p>parent<span>child</span></p><ul></ul></div>', 'p', 'span');

        browserMoveTrigger(root, parent);
        expect(log).toEqual('parentEnter;');

        browserMoveTrigger(parent, child);
        expect(log).toEqual('parentEnter;childEnter;');

        browserMoveTrigger(child, parent);
        expect(log).toEqual('parentEnter;childEnter;childLeave;');

        browserMoveTrigger(parent, root);
        expect(log).toEqual('parentEnter;childEnter;childLeave;parentLeave;');

      });

      it('should fire the mousenter on SVG elements', function() {
        if (!_jqLiteMode) return;

        setup(
          '<div>' +
          '<svg xmlns="http://www.w3.org/2000/svg"' +
          '     viewBox="0 0 18.75 18.75"' +
          '     width="18.75"' +
          '     height="18.75"' +
          '     version="1.1">' +
          '       <path d="M0,0c0,4.142,3.358,7.5,7.5,7.5s7.5-3.358,7.5-7.5-3.358-7.5-7.5-7.5-7.5,3.358-7.5,7.5"' +
          '             fill-rule="nonzero"' +
          '             fill="#CCC"' +
          '             ng-attr-fill="{{data.color || \'#CCC\'}}"/>' +
          '</svg>' +
          '</div>',
          'svg', 'path');

        browserMoveTrigger(parent, child);
        expect(log).toEqual('childEnter;');
      });
    });

    it('should throw an error if eventData or a selector is passed', function() {
      if (!_jqLiteMode) return;

      var elm = jqLite(a),
          anObj = {},
          aString = '',
          aValue = 45,
          callback = function() {};

      expect(function() {
        elm.on('click', anObj, callback);
      }).toThrowMinErr('jqLite', 'onargs');

      expect(function() {
        elm.on('click', null, aString, callback);
      }).toThrowMinErr('jqLite', 'onargs');

      expect(function() {
        elm.on('click', aValue, callback);
      }).toThrowMinErr('jqLite', 'onargs');

    });
  });


  describe('off', function() {
    it('should do nothing when no listener was registered with bound', function() {
      var aElem = jqLite(a);

      aElem.off();
      aElem.off('click');
      aElem.off('click', function() {});
    });

    it('should do nothing when a specific listener was not registered', function() {
      var aElem = jqLite(a);
      aElem.on('click', function() {});

      aElem.off('mouseenter', function() {});
    });

    it('should deregister all listeners', function() {
      var aElem = jqLite(a),
          clickSpy = jasmine.createSpy('click'),
          mouseoverSpy = jasmine.createSpy('mouseover');

      aElem.on('click', clickSpy);
      aElem.on('mouseover', mouseoverSpy);

      browserTrigger(a, 'click');
      expect(clickSpy).toHaveBeenCalledOnce();
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).toHaveBeenCalledOnce();

      clickSpy.calls.reset();
      mouseoverSpy.calls.reset();

      aElem.off();

      browserTrigger(a, 'click');
      expect(clickSpy).not.toHaveBeenCalled();
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).not.toHaveBeenCalled();
    });


    it('should deregister listeners for specific type', function() {
      var aElem = jqLite(a),
          clickSpy = jasmine.createSpy('click'),
          mouseoverSpy = jasmine.createSpy('mouseover');

      aElem.on('click', clickSpy);
      aElem.on('mouseover', mouseoverSpy);

      browserTrigger(a, 'click');
      expect(clickSpy).toHaveBeenCalledOnce();
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).toHaveBeenCalledOnce();

      clickSpy.calls.reset();
      mouseoverSpy.calls.reset();

      aElem.off('click');

      browserTrigger(a, 'click');
      expect(clickSpy).not.toHaveBeenCalled();
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).toHaveBeenCalledOnce();

      mouseoverSpy.calls.reset();

      aElem.off('mouseover');
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).not.toHaveBeenCalled();
    });


    it('should deregister all listeners for types separated by spaces', function() {
      var aElem = jqLite(a),
          clickSpy = jasmine.createSpy('click'),
          mouseoverSpy = jasmine.createSpy('mouseover');

      aElem.on('click', clickSpy);
      aElem.on('mouseover', mouseoverSpy);

      browserTrigger(a, 'click');
      expect(clickSpy).toHaveBeenCalledOnce();
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).toHaveBeenCalledOnce();

      clickSpy.calls.reset();
      mouseoverSpy.calls.reset();

      aElem.off('click mouseover');

      browserTrigger(a, 'click');
      expect(clickSpy).not.toHaveBeenCalled();
      browserTrigger(a, 'mouseover');
      expect(mouseoverSpy).not.toHaveBeenCalled();
    });


    it('should deregister specific listener', function() {
      var aElem = jqLite(a),
          clickSpy1 = jasmine.createSpy('click1'),
          clickSpy2 = jasmine.createSpy('click2');

      aElem.on('click', clickSpy1);
      aElem.on('click', clickSpy2);

      browserTrigger(a, 'click');
      expect(clickSpy1).toHaveBeenCalledOnce();
      expect(clickSpy2).toHaveBeenCalledOnce();

      clickSpy1.calls.reset();
      clickSpy2.calls.reset();

      aElem.off('click', clickSpy1);

      browserTrigger(a, 'click');
      expect(clickSpy1).not.toHaveBeenCalled();
      expect(clickSpy2).toHaveBeenCalledOnce();

      clickSpy2.calls.reset();

      aElem.off('click', clickSpy2);
      browserTrigger(a, 'click');
      expect(clickSpy2).not.toHaveBeenCalled();
    });


    it('should correctly deregister the mouseenter/mouseleave listeners', function() {
      var aElem = jqLite(a);
      var onMouseenter = jasmine.createSpy('onMouseenter');
      var onMouseleave = jasmine.createSpy('onMouseleave');

      aElem.on('mouseenter', onMouseenter);
      aElem.on('mouseleave', onMouseleave);
      aElem.off('mouseenter', onMouseenter);
      aElem.off('mouseleave', onMouseleave);
      aElem.on('mouseenter', onMouseenter);
      aElem.on('mouseleave', onMouseleave);

      browserTrigger(a, 'mouseover', {relatedTarget: b});
      expect(onMouseenter).toHaveBeenCalledOnce();

      browserTrigger(a, 'mouseout', {relatedTarget: b});
      expect(onMouseleave).toHaveBeenCalledOnce();
    });


    it('should call a `mouseenter/leave` listener only once when `mouseenter/leave` and `mouseover/out` '
       + 'are triggered simultaneously', function() {
      var aElem = jqLite(a);
      var onMouseenter = jasmine.createSpy('mouseenter');
      var onMouseleave = jasmine.createSpy('mouseleave');

      aElem.on('mouseenter', onMouseenter);
      aElem.on('mouseleave', onMouseleave);

      browserTrigger(a, 'mouseenter', {relatedTarget: b});
      browserTrigger(a, 'mouseover', {relatedTarget: b});
      expect(onMouseenter).toHaveBeenCalledOnce();

      browserTrigger(a, 'mouseleave', {relatedTarget: b});
      browserTrigger(a, 'mouseout', {relatedTarget: b});
      expect(onMouseleave).toHaveBeenCalledOnce();
    });

    it('should call a `mouseenter/leave` listener when manually triggering the event', function() {
      var aElem = jqLite(a);
      var onMouseenter = jasmine.createSpy('mouseenter');
      var onMouseleave = jasmine.createSpy('mouseleave');

      aElem.on('mouseenter', onMouseenter);
      aElem.on('mouseleave', onMouseleave);

      aElem.triggerHandler('mouseenter');
      expect(onMouseenter).toHaveBeenCalledOnce();

      aElem.triggerHandler('mouseleave');
      expect(onMouseleave).toHaveBeenCalledOnce();
    });


    it('should deregister specific listener within the listener and call subsequent listeners', function() {
      var aElem = jqLite(a),
          clickSpy = jasmine.createSpy('click'),
          clickOnceSpy = jasmine.createSpy('clickOnce').and.callFake(function() {
            aElem.off('click', clickOnceSpy);
          });

      aElem.on('click', clickOnceSpy);
      aElem.on('click', clickSpy);

      browserTrigger(a, 'click');
      expect(clickOnceSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();

      browserTrigger(a, 'click');
      expect(clickOnceSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledTimes(2);
    });


    it('should deregister specific listener for multiple types separated by spaces', function() {
      var aElem = jqLite(a),
          leaderSpy = jasmine.createSpy('leader'),
          extraSpy = jasmine.createSpy('extra');

      aElem.on('click', leaderSpy);
      aElem.on('click', extraSpy);
      aElem.on('mouseover', leaderSpy);

      browserTrigger(a, 'click');
      browserTrigger(a, 'mouseover');
      expect(leaderSpy).toHaveBeenCalledTimes(2);
      expect(extraSpy).toHaveBeenCalledOnce();

      leaderSpy.calls.reset();
      extraSpy.calls.reset();

      aElem.off('click mouseover', leaderSpy);

      browserTrigger(a, 'click');
      browserTrigger(a, 'mouseover');
      expect(leaderSpy).not.toHaveBeenCalled();
      expect(extraSpy).toHaveBeenCalledOnce();
    });


    describe('native listener deregistration', function() {
      it('should deregister the native listener when all jqLite listeners for given type are gone ' +
         'after off("eventName", listener) call',  function() {
        var aElem = jqLite(a);
        var addEventListenerSpy = spyOn(aElem[0], 'addEventListener').and.callThrough();
        var removeEventListenerSpy = spyOn(aElem[0], 'removeEventListener').and.callThrough();
        var nativeListenerFn;

        var jqLiteListener = function() {};
        aElem.on('click', jqLiteListener);

        // jQuery <2.2 passes the non-needed `false` useCapture parameter.
        // See https://github.com/jquery/jquery/issues/2199 for details.
        if (isJQuery21()) {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function), false);
        } else {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function));
        }
        nativeListenerFn = addEventListenerSpy.calls.mostRecent().args[1];
        expect(removeEventListenerSpy).not.toHaveBeenCalled();

        aElem.off('click', jqLiteListener);
        if (isJQuery21()) {
          expect(removeEventListenerSpy).toHaveBeenCalledOnceWith('click', nativeListenerFn, false);
        } else {
          expect(removeEventListenerSpy).toHaveBeenCalledOnceWith('click', nativeListenerFn);
        }
      });


      it('should deregister the native listener when all jqLite listeners for given type are gone ' +
         'after off("eventName") call',  function() {
        var aElem = jqLite(a);
        var addEventListenerSpy = spyOn(aElem[0], 'addEventListener').and.callThrough();
        var removeEventListenerSpy = spyOn(aElem[0], 'removeEventListener').and.callThrough();
        var nativeListenerFn;

        aElem.on('click', function() {});
        if (isJQuery21()) {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function), false);
        } else {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function));
        }
        nativeListenerFn = addEventListenerSpy.calls.mostRecent().args[1];
        expect(removeEventListenerSpy).not.toHaveBeenCalled();

        aElem.off('click');
        if (isJQuery21()) {
          expect(removeEventListenerSpy).toHaveBeenCalledOnceWith('click', nativeListenerFn, false);
        } else {
          expect(removeEventListenerSpy).toHaveBeenCalledOnceWith('click', nativeListenerFn);
        }
      });


      it('should deregister the native listener when all jqLite listeners for given type are gone ' +
         'after off("eventName1 eventName2") call',  function() {
        var aElem = jqLite(a);
        var addEventListenerSpy = spyOn(aElem[0], 'addEventListener').and.callThrough();
        var removeEventListenerSpy = spyOn(aElem[0], 'removeEventListener').and.callThrough();
        var nativeListenerFn;

        aElem.on('click', function() {});
        if (isJQuery21()) {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function), false);
        } else {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function));
        }
        nativeListenerFn = addEventListenerSpy.calls.mostRecent().args[1];
        addEventListenerSpy.calls.reset();

        aElem.on('dblclick', function() {});
        if (isJQuery21()) {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('dblclick', nativeListenerFn, false);
        } else {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('dblclick', nativeListenerFn);
        }

        expect(removeEventListenerSpy).not.toHaveBeenCalled();

        aElem.off('click dblclick');

        if (isJQuery21()) {
          expect(removeEventListenerSpy).toHaveBeenCalledWith('click', nativeListenerFn, false);
          expect(removeEventListenerSpy).toHaveBeenCalledWith('dblclick', nativeListenerFn, false);
        } else {
          expect(removeEventListenerSpy).toHaveBeenCalledWith('click', nativeListenerFn);
          expect(removeEventListenerSpy).toHaveBeenCalledWith('dblclick', nativeListenerFn);
        }
        expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
      });


      it('should deregister the native listener when all jqLite listeners for given type are gone ' +
         'after off() call',  function() {
        var aElem = jqLite(a);
        var addEventListenerSpy = spyOn(aElem[0], 'addEventListener').and.callThrough();
        var removeEventListenerSpy = spyOn(aElem[0], 'removeEventListener').and.callThrough();
        var nativeListenerFn;

        aElem.on('click', function() {});
        if (isJQuery21()) {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function), false);
        } else {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('click', jasmine.any(Function));
        }
        nativeListenerFn = addEventListenerSpy.calls.mostRecent().args[1];
        addEventListenerSpy.calls.reset();

        aElem.on('dblclick', function() {});
        if (isJQuery21()) {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('dblclick', nativeListenerFn, false);
        } else {
          expect(addEventListenerSpy).toHaveBeenCalledOnceWith('dblclick', nativeListenerFn);
        }

        aElem.off();

        if (isJQuery21()) {
          expect(removeEventListenerSpy).toHaveBeenCalledWith('click', nativeListenerFn, false);
          expect(removeEventListenerSpy).toHaveBeenCalledWith('dblclick', nativeListenerFn, false);
        } else {
          expect(removeEventListenerSpy).toHaveBeenCalledWith('click', nativeListenerFn);
          expect(removeEventListenerSpy).toHaveBeenCalledWith('dblclick', nativeListenerFn);
        }
        expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
      });
    });


    it('should throw an error if a selector is passed', function() {
      if (!_jqLiteMode) return;

      var aElem = jqLite(a);
      aElem.on('click', noop);
      expect(function() {
        aElem.off('click', noop, '.test');
      }).toThrowMinErr('jqLite', 'offargs');
    });
  });

  describe('one', function() {

    it('should only fire the callback once', function() {
      var element = jqLite(a);
      var spy = jasmine.createSpy('click');

      element.one('click', spy);

      browserTrigger(element, 'click');
      expect(spy).toHaveBeenCalledOnce();

      browserTrigger(element, 'click');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('should deregister when off is called', function() {
      var element = jqLite(a);
      var spy = jasmine.createSpy('click');

      element.one('click', spy);
      element.off('click', spy);

      browserTrigger(element, 'click');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should return the same event object just as on() does', function() {
      var element = jqLite(a);
      var eventA, eventB;
      element.on('click', function(event) {
        eventA = event;
      });
      element.one('click', function(event) {
        eventB = event;
      });

      browserTrigger(element, 'click');
      expect(eventA).toEqual(eventB);
    });

    it('should not remove other event handlers of the same type after execution', function() {
      var element = jqLite(a);
      var calls = [];
      element.one('click', function(event) {
        calls.push('one');
      });
      element.on('click', function(event) {
        calls.push('on');
      });

      browserTrigger(element, 'click');
      browserTrigger(element, 'click');

      expect(calls).toEqual(['one','on','on']);
    });
  });


  describe('replaceWith', function() {
    it('should replaceWith', function() {
      var root = jqLite('<div>').html('before-<div></div>after');
      var div = root.find('div');
      expect(div.replaceWith('<span>span-</span><b>bold-</b>')).toEqual(div);
      expect(root.text()).toEqual('before-span-bold-after');
    });


    it('should replaceWith text', function() {
      var root = jqLite('<div>').html('before-<div></div>after');
      var div = root.find('div');
      expect(div.replaceWith('text-')).toEqual(div);
      expect(root.text()).toEqual('before-text-after');
    });
  });


  describe('children', function() {
    it('should only select element nodes', function() {
      var root = jqLite('<div><!-- some comment -->before-<div></div>after-<span></span>');
      var div = root.find('div');
      var span = root.find('span');
      expect(root.children()).toJqEqual([div, span]);
    });
  });


  describe('contents', function() {
    it('should select all types child nodes', function() {
      var root = jqLite('<div><!-- some comment -->before-<div></div>after-<span></span></div>');
      var contents = root.contents();
      expect(contents.length).toEqual(5);
      expect(contents[0].data).toEqual(' some comment ');
      expect(contents[1].data).toEqual('before-');
    });

    it('should select all types iframe contents', function(done) {
      var iframe_ = document.createElement('iframe');
      var tested = false;
      var iframe = jqLite(iframe_);
      function test() {
        var doc = iframe_.contentDocument || iframe_.contentWindow.document;
        doc.body.innerHTML = '\n<span>Text</span>\n';

        var contents = iframe.contents();
        expect(contents[0]).toBeTruthy();
        expect(contents.length).toBe(1);
        expect(contents.prop('nodeType')).toBe(9);
        expect(contents[0].body).toBeTruthy();
        expect(jqLite(contents[0].body).contents().length).toBe(3);
        iframe.remove();
        doc = null;
        tested = true;
      }
      iframe_.onload = iframe_.onreadystatechange = function() {
        if (iframe_.contentDocument) test();
      };
      // eslint-disable-next-line no-script-url
      iframe_.src = 'javascript:false';
      jqLite(document).find('body').append(iframe);

      // This test is potentially flaky on CI cloud instances, so there is a generous
      // wait period...
      var job = createAsync(done);
      job.waitsFor(function() { return tested; }, 'iframe to load', 5000).done();
      job.start();
    });
  });


  describe('append', function() {
    it('should append', function() {
      var root = jqLite('<div>');
      expect(root.append('<span>abc</span>')).toEqual(root);
      expect(root.html().toLowerCase()).toEqual('<span>abc</span>');
    });
    it('should append text', function() {
      var root = jqLite('<div>');
      expect(root.append('text')).toEqual(root);
      expect(root.html()).toEqual('text');
    });
    it('should append to document fragment', function() {
      var root = jqLite(document.createDocumentFragment());
      expect(root.append('<p>foo</p>')).toBe(root);
      expect(root.children().length).toBe(1);
    });
    it('should not append anything if parent node is not of type element or docfrag', function() {
      var root = jqLite('<p>some text node</p>').contents();
      expect(root.append('<p>foo</p>')).toBe(root);
      expect(root.children().length).toBe(0);
    });
  });


  describe('wrap', function() {
    it('should wrap text node', function() {
      var root = jqLite('<div>A&lt;a&gt;B&lt;/a&gt;C</div>');
      var text = root.contents();
      expect(text.wrap('<span>')[0]).toBe(text[0]);
      expect(root.find('span').text()).toEqual('A<a>B</a>C');
    });
    it('should wrap free text node', function() {
      var root = jqLite('<div>A&lt;a&gt;B&lt;/a&gt;C</div>');
      var text = root.contents();
      text.remove();
      expect(root.text()).toBe('');

      text.wrap('<span>');
      expect(text.parent().text()).toEqual('A<a>B</a>C');
    });
    it('should clone elements to be wrapped around target', function() {
      var root = jqLite('<div class="sigil"></div>');
      var span = jqLite('<span>A</span>');

      span.wrap(root);
      expect(root.children().length).toBe(0);
      expect(span.parent().hasClass('sigil')).toBeTruthy();
    });
    it('should wrap multiple elements', function() {
      var root = jqLite('<div class="sigil"></div>');
      var spans = jqLite('<span>A</span><span>B</span><span>C</span>');

      spans.wrap(root);

      expect(spans.eq(0).parent().hasClass('sigil')).toBeTruthy();
      expect(spans.eq(1).parent().hasClass('sigil')).toBeTruthy();
      expect(spans.eq(2).parent().hasClass('sigil')).toBeTruthy();
    });
  });


  describe('prepend', function() {
    it('should prepend to empty', function() {
      var root = jqLite('<div>');
      expect(root.prepend('<span>abc</span>')).toEqual(root);
      expect(root.html().toLowerCase()).toEqual('<span>abc</span>');
    });
    it('should prepend to content', function() {
      var root = jqLite('<div>text</div>');
      expect(root.prepend('<span>abc</span>')).toEqual(root);
      expect(root.html().toLowerCase()).toEqual('<span>abc</span>text');
    });
    it('should prepend text to content', function() {
      var root = jqLite('<div>text</div>');
      expect(root.prepend('abc')).toEqual(root);
      expect(root.html().toLowerCase()).toEqual('abctext');
    });
    it('should prepend array to empty in the right order', function() {
      var root = jqLite('<div>');
      expect(root.prepend([a, b, c])).toBe(root);
      expect(sortedHtml(root)).
        toBe('<div><div>A</div><div>B</div><div>C</div></div>');
    });
    it('should prepend array to content in the right order', function() {
      var root = jqLite('<div>text</div>');
      expect(root.prepend([a, b, c])).toBe(root);
      expect(sortedHtml(root)).
        toBe('<div><div>A</div><div>B</div><div>C</div>text</div>');
    });
  });


  describe('remove', function() {
    it('should remove', function() {
      var root = jqLite('<div><span>abc</span></div>');
      var span = root.find('span');
      expect(span.remove()).toEqual(span);
      expect(root.html()).toEqual('');
    });
  });


  describe('detach', function() {
    it('should detach', function() {
      var root = jqLite('<div><span>abc</span></div>');
      var span = root.find('span');
      expect(span.detach()).toEqual(span);
      expect(root.html()).toEqual('');
    });
  });


  describe('after', function() {
    it('should after', function() {
      var root = jqLite('<div><span></span></div>');
      var span = root.find('span');
      expect(span.after('<i></i><b></b>')).toEqual(span);
      expect(root.html().toLowerCase()).toEqual('<span></span><i></i><b></b>');
    });


    it('should allow taking text', function() {
      var root = jqLite('<div><span></span></div>');
      var span = root.find('span');
      span.after('abc');
      expect(root.html().toLowerCase()).toEqual('<span></span>abc');
    });


    it('should not throw when the element has no parent', function() {
      var span = jqLite('<span></span>');
      expect(function() { span.after('abc'); }).not.toThrow();
      expect(span.length).toBe(1);
      expect(span[0].outerHTML).toBe('<span></span>');
    });
  });


  describe('parent', function() {
    it('should return parent or an empty set when no parent', function() {
      var parent = jqLite('<div><p>abc</p></div>'),
          child = parent.find('p');

      expect(parent.parent()).toBeTruthy();
      expect(parent.parent().length).toEqual(0);

      expect(child.parent().length).toBe(1);
      expect(child.parent()[0]).toBe(parent[0]);
    });


    it('should return empty set when no parent', function() {
      var element = jqLite('<div>abc</div>');
      expect(element.parent()).toBeTruthy();
      expect(element.parent().length).toEqual(0);
    });


    it('should return empty jqLite object when parent is a document fragment', function() {
      //this is quite unfortunate but jQuery 1.5.1 behaves this way
      var fragment = document.createDocumentFragment(),
          child = jqLite('<p>foo</p>');

      fragment.appendChild(child[0]);
      expect(child[0].parentNode).toBe(fragment);
      expect(child.parent().length).toBe(0);
    });
  });


  describe('next', function() {
    it('should return next sibling', function() {
      var element = jqLite('<div><b>b</b><i>i</i></div>');
      var b = element.find('b');
      var i = element.find('i');
      expect(b.next()).toJqEqual([i]);
    });


    it('should ignore non-element siblings', function() {
      var element = jqLite('<div><b>b</b>TextNode<!-- comment node --><i>i</i></div>');
      var b = element.find('b');
      var i = element.find('i');
      expect(b.next()).toJqEqual([i]);
    });
  });


  describe('find', function() {
    it('should find child by name', function() {
      var root = jqLite('<div><div>text</div></div>');
      var innerDiv = root.find('div');
      expect(innerDiv.length).toEqual(1);
      expect(innerDiv.html()).toEqual('text');
    });

    it('should find child by name and not care about text nodes', function() {
      var divs = jqLite('<div><span>aa</span></div>text<div><span>bb</span></div>');
      var innerSpan = divs.find('span');
      expect(innerSpan.length).toEqual(2);
    });
  });


  describe('eq', function() {
    it('should select the nth element ', function() {
      var element = jqLite('<div><span>aa</span></div><div><span>bb</span></div>');
      expect(element.find('span').eq(0).html()).toBe('aa');
      expect(element.find('span').eq(-1).html()).toBe('bb');
      expect(element.find('span').eq(20).length).toBe(0);
    });
  });


  describe('triggerHandler', function() {
    it('should trigger all registered handlers for an event', function() {
      var element = jqLite('<span>poke</span>'),
          pokeSpy = jasmine.createSpy('poke'),
          clickSpy1 = jasmine.createSpy('clickSpy1'),
          clickSpy2 = jasmine.createSpy('clickSpy2');

      element.on('poke', pokeSpy);
      element.on('click', clickSpy1);
      element.on('click', clickSpy2);

      expect(pokeSpy).not.toHaveBeenCalled();
      expect(clickSpy1).not.toHaveBeenCalled();
      expect(clickSpy2).not.toHaveBeenCalled();

      element.triggerHandler('poke');
      expect(pokeSpy).toHaveBeenCalledOnce();
      expect(clickSpy1).not.toHaveBeenCalled();
      expect(clickSpy2).not.toHaveBeenCalled();

      element.triggerHandler('click');
      expect(clickSpy1).toHaveBeenCalledOnce();
      expect(clickSpy2).toHaveBeenCalledOnce();
    });

    it('should pass in a dummy event', function() {
      // we need the event to have at least preventDefault because AngularJS will call it on
      // all anchors with no href automatically

      var element = jqLite('<a>poke</a>'),
          pokeSpy = jasmine.createSpy('poke'),
          event;

      element.on('click', pokeSpy);

      element.triggerHandler('click');
      event = pokeSpy.calls.mostRecent().args[0];
      expect(event.preventDefault).toBeDefined();
      expect(event.target).toEqual(element[0]);
      expect(event.type).toEqual('click');
    });

    it('should pass extra parameters as an additional argument', function() {
      var element = jqLite('<a>poke</a>'),
          pokeSpy = jasmine.createSpy('poke'),
          data;

      element.on('click', pokeSpy);

      element.triggerHandler('click', [{hello: 'world'}]);
      data = pokeSpy.calls.mostRecent().args[1];
      expect(data.hello).toBe('world');
    });

    it('should mark event as prevented if preventDefault is called', function() {
      var element = jqLite('<a>poke</a>'),
          pokeSpy = jasmine.createSpy('poke'),
          event;

      element.on('click', pokeSpy);
      element.triggerHandler('click');
      event = pokeSpy.calls.mostRecent().args[0];

      expect(event.isDefaultPrevented()).toBe(false);
      event.preventDefault();
      expect(event.isDefaultPrevented()).toBe(true);
    });

    it('should support handlers that deregister themselves', function() {
      var element = jqLite('<a>poke</a>'),
          clickSpy = jasmine.createSpy('click'),
          clickOnceSpy = jasmine.createSpy('clickOnce').and.callFake(function() {
            element.off('click', clickOnceSpy);
          });

      element.on('click', clickOnceSpy);
      element.on('click', clickSpy);

      element.triggerHandler('click');
      expect(clickOnceSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();

      element.triggerHandler('click');
      expect(clickOnceSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledTimes(2);
    });

    it('should accept a custom event instead of eventName', function() {
      var element = jqLite('<a>poke</a>'),
          pokeSpy = jasmine.createSpy('poke'),
          customEvent = {
            type: 'click',
            someProp: 'someValue'
          },
          actualEvent;

      element.on('click', pokeSpy);
      element.triggerHandler(customEvent);
      actualEvent = pokeSpy.calls.mostRecent().args[0];
      expect(actualEvent.preventDefault).toBeDefined();
      expect(actualEvent.someProp).toEqual('someValue');
      expect(actualEvent.target).toEqual(element[0]);
      expect(actualEvent.type).toEqual('click');
    });

    it('should stop triggering handlers when stopImmediatePropagation is called', function() {
      var element = jqLite(a),
          clickSpy1 = jasmine.createSpy('clickSpy1'),
          clickSpy2 = jasmine.createSpy('clickSpy2').and.callFake(function(event) { event.stopImmediatePropagation(); }),
          clickSpy3 = jasmine.createSpy('clickSpy3');

      element.on('click', clickSpy1);
      element.on('click', clickSpy2);
      element.on('click', clickSpy3);

      element.triggerHandler('click');

      expect(clickSpy1).toHaveBeenCalled();
      expect(clickSpy2).toHaveBeenCalled();
      expect(clickSpy3).not.toHaveBeenCalled();
    });

    it('should have event.isImmediatePropagationStopped method', function() {
      var element = jqLite(a),
          clickSpy = jasmine.createSpy('clickSpy'),
          event;

      element.on('click', clickSpy);
      element.triggerHandler('click');
      event = clickSpy.calls.mostRecent().args[0];

      expect(event.isImmediatePropagationStopped()).toBe(false);
      event.stopImmediatePropagation();
      expect(event.isImmediatePropagationStopped()).toBe(true);
    });
  });


  describe('kebabToCamel', function() {
    it('should leave non-dashed strings alone', function() {
      expect(kebabToCamel('foo')).toBe('foo');
      expect(kebabToCamel('')).toBe('');
      expect(kebabToCamel('fooBar')).toBe('fooBar');
    });

    it('should convert dash-separated strings to camelCase', function() {
      expect(kebabToCamel('foo-bar')).toBe('fooBar');
      expect(kebabToCamel('foo-bar-baz')).toBe('fooBarBaz');
      expect(kebabToCamel('foo:bar_baz')).toBe('foo:bar_baz');
    });

    it('should convert leading dashes followed by a lowercase letter', function() {
      expect(kebabToCamel('-foo-bar')).toBe('FooBar');
    });

    it('should not convert dashes followed by a non-letter', function() {
      expect(kebabToCamel('foo-42- -a-B')).toBe('foo-42- A-B');
    });

    it('should not convert browser specific css properties in a special way', function() {
      expect(kebabToCamel('-ms-foo-bar')).toBe('MsFooBar');
      expect(kebabToCamel('-moz-foo-bar')).toBe('MozFooBar');
      expect(kebabToCamel('-webkit-foo-bar')).toBe('WebkitFooBar');
    });

    it('should not collapse sequences of dashes', function() {
      expect(kebabToCamel('foo---bar-baz--qaz')).toBe('foo--BarBaz-Qaz');
    });
  });


  describe('jqLiteDocumentLoaded', function() {

    function createMockWindow(readyState) {
      return {
        document: {readyState: readyState || 'loading'},
        setTimeout: jasmine.createSpy('window.setTimeout'),
        addEventListener: jasmine.createSpy('window.addEventListener'),
        removeEventListener: jasmine.createSpy('window.removeEventListener')
      };
    }

    it('should execute the callback via a timeout if the document has already completed loading', function() {
      function onLoadCallback() { }

      var mockWindow = createMockWindow('complete');

      jqLiteDocumentLoaded(onLoadCallback, mockWindow);

      expect(mockWindow.addEventListener).not.toHaveBeenCalled();
      expect(mockWindow.setTimeout.calls.mostRecent().args[0]).toBe(onLoadCallback);
    });


    it('should register a listener for the `load` event', function() {
      var onLoadCallback = jasmine.createSpy('onLoadCallback');
      var mockWindow = createMockWindow();

      jqLiteDocumentLoaded(onLoadCallback, mockWindow);

      expect(mockWindow.addEventListener).toHaveBeenCalledOnce();
    });


    it('should execute the callback only once the document completes loading', function() {
      var onLoadCallback = jasmine.createSpy('onLoadCallback');
      var mockWindow = createMockWindow();

      jqLiteDocumentLoaded(onLoadCallback, mockWindow);
      expect(onLoadCallback).not.toHaveBeenCalled();

      jqLite(mockWindow).triggerHandler('load');
      expect(onLoadCallback).toHaveBeenCalledOnce();
    });
  });


  describe('bind/unbind', function() {
    if (!_jqLiteMode) return;

    it('should alias bind() to on()', function() {
      var element = jqLite(a);
      expect(element.bind).toBe(element.on);
    });

    it('should alias unbind() to off()', function() {
      var element = jqLite(a);
      expect(element.unbind).toBe(element.off);
    });
  });
});
'use strict';

describe('module loader', function() {
  var window;

  beforeEach(function() {
    window = {};
    setupModuleLoader(window);
  });


  it('should set up namespace', function() {
    expect(window.angular).toBeDefined();
    expect(window.angular.module).toBeDefined();
  });


  it('should not override existing namespace', function() {
    var angular = window.angular;
    var module = angular.module;

    setupModuleLoader(window);
    expect(window.angular).toBe(angular);
    expect(window.angular.module).toBe(module);
  });


  it('should record calls', function() {
    var otherModule = window.angular.module('other', []);
    otherModule.config('otherInit');

    var myModule = window.angular.module('my', ['other'], 'config');

    expect(myModule.
      decorator('dk', 'dv').
      provider('sk', 'sv').
      factory('fk', 'fv').
      service('a', 'aa').
      value('k', 'v').
      filter('f', 'ff').
      directive('d', 'dd').
      component('c', 'cc').
      controller('ctrl', 'ccc').
      config('init2').
      constant('abc', 123).
      run('runBlock')).toBe(myModule);

    expect(myModule.requires).toEqual(['other']);
    expect(myModule._invokeQueue).toEqual([
      ['$provide', 'constant', jasmine.objectContaining(['abc', 123])],
      ['$provide', 'provider', jasmine.objectContaining(['sk', 'sv'])],
      ['$provide', 'factory', jasmine.objectContaining(['fk', 'fv'])],
      ['$provide', 'service', jasmine.objectContaining(['a', 'aa'])],
      ['$provide', 'value', jasmine.objectContaining(['k', 'v'])],
      ['$filterProvider', 'register', jasmine.objectContaining(['f', 'ff'])],
      ['$compileProvider', 'directive', jasmine.objectContaining(['d', 'dd'])],
      ['$compileProvider', 'component', jasmine.objectContaining(['c', 'cc'])],
      ['$controllerProvider', 'register', jasmine.objectContaining(['ctrl', 'ccc'])]
    ]);
    expect(myModule._configBlocks).toEqual([
      ['$injector', 'invoke', jasmine.objectContaining(['config'])],
      ['$provide', 'decorator', jasmine.objectContaining(['dk', 'dv'])],
      ['$injector', 'invoke', jasmine.objectContaining(['init2'])]
    ]);
    expect(myModule._runBlocks).toEqual(['runBlock']);
  });


  it('should not throw error when `module.decorator` is declared before provider that it decorates', function() {
    angular.module('theModule', []).
      decorator('theProvider', function($delegate) { return $delegate; }).
      factory('theProvider', function() { return {}; });

    expect(function() {
      createInjector(['theModule']);
    }).not.toThrow();
  });


  it('should run decorators in order of declaration, even when mixed with provider.decorator', function() {
    var log = '';

    angular.module('theModule', [])
      .factory('theProvider', function() {
        return {api: 'provider'};
      })
      .decorator('theProvider', function($delegate) {
        $delegate.api = $delegate.api + '-first';
        return $delegate;
      })
      .config(function($provide) {
        $provide.decorator('theProvider', function($delegate) {
          $delegate.api = $delegate.api + '-second';
          return $delegate;
        });
      })
      .decorator('theProvider', function($delegate) {
        $delegate.api = $delegate.api + '-third';
        return $delegate;
      })
      .run(function(theProvider) {
        log = theProvider.api;
      });

      createInjector(['theModule']);
      expect(log).toBe('provider-first-second-third');
  });


  it('should decorate the last declared provider if multiple have been declared', function() {
    var log = '';

    angular.module('theModule', []).
      factory('theProvider', function() {
        return {
          api: 'firstProvider'
        };
      }).
      decorator('theProvider', function($delegate) {
        $delegate.api = $delegate.api + '-decorator';
        return $delegate;
      }).
      factory('theProvider', function() {
        return {
          api: 'secondProvider'
        };
      }).
      run(function(theProvider) {
        log = theProvider.api;
      });

    createInjector(['theModule']);
    expect(log).toBe('secondProvider-decorator');
  });


  it('should allow module redefinition', function() {
    expect(window.angular.module('a', [])).not.toBe(window.angular.module('a', []));
  });


  it('should complain of no module', function() {
    expect(function() {
      window.angular.module('dontExist');
    }).toThrowMinErr('$injector', 'nomod', 'Module \'dontExist\' is not available! You either misspelled the module name ' +
            'or forgot to load it. If registering a module ensure that you specify the dependencies as the second ' +
            'argument.');
  });

  it('should complain if a module is called "hasOwnProperty', function() {
    expect(function() {
      window.angular.module('hasOwnProperty', []);
    }).toThrowMinErr('ng','badname', 'hasOwnProperty is not a valid module name');
  });

  it('should expose `$$minErr` on the `angular` object', function() {
    expect(window.angular.$$minErr).toEqual(jasmine.any(Function));
  });

  describe('Module', function() {
    describe('info()', function() {
      var theModule;

      beforeEach(function() {
        theModule = angular.module('theModule', []);
      });

      it('should default to an empty object', function() {
        expect(theModule.info()).toEqual({});
      });

      it('should store the object passed as a param', function() {
        theModule.info({ version: '1.2' });
        expect(theModule.info()).toEqual({ version: '1.2' });
      });

      it('should throw if the parameter is not an object', function() {
        expect(function() {
          theModule.info('some text');
        }).toThrowMinErr('ng', 'aobj');
      });

      it('should completely replace the previous info object', function() {
        theModule.info({ value: 'X' });
        theModule.info({ newValue: 'Y' });
        expect(theModule.info()).toEqual({ newValue: 'Y' });
      });
    });
  });
});
'use strict';

describe('api', function() {
  describe('hashKey()', function() {
    it('should use an existing `$$hashKey`', function() {
      var obj = {$$hashKey: 'foo'};
      expect(hashKey(obj)).toBe('foo');
    });

    it('should support a function as `$$hashKey` (and call it)', function() {
      var obj = {$$hashKey: valueFn('foo')};
      expect(hashKey(obj)).toBe('foo');
    });

    it('should create a new `$$hashKey` if none exists (and return it)', function() {
      var obj = {};
      expect(hashKey(obj)).toBe(obj.$$hashKey);
      expect(obj.$$hashKey).toBeDefined();
    });

    it('should create appropriate `$$hashKey`s for primitive values', function() {
      expect(hashKey(undefined)).toBe(hashKey(undefined));
      expect(hashKey(null)).toBe(hashKey(null));
      expect(hashKey(null)).not.toBe(hashKey(undefined));
      expect(hashKey(true)).toBe(hashKey(true));
      expect(hashKey(false)).toBe(hashKey(false));
      expect(hashKey(false)).not.toBe(hashKey(true));
      expect(hashKey(42)).toBe(hashKey(42));
      expect(hashKey(1337)).toBe(hashKey(1337));
      expect(hashKey(1337)).not.toBe(hashKey(42));
      expect(hashKey('foo')).toBe(hashKey('foo'));
      expect(hashKey('foo')).not.toBe(hashKey('bar'));
    });

    it('should create appropriate `$$hashKey`s for non-primitive values', function() {
      var fn = function() {};
      var arr = [];
      var obj = {};
      var date = new Date();

      expect(hashKey(fn)).toBe(hashKey(fn));
      expect(hashKey(fn)).not.toBe(hashKey(function() {}));
      expect(hashKey(arr)).toBe(hashKey(arr));
      expect(hashKey(arr)).not.toBe(hashKey([]));
      expect(hashKey(obj)).toBe(hashKey(obj));
      expect(hashKey(obj)).not.toBe(hashKey({}));
      expect(hashKey(date)).toBe(hashKey(date));
      expect(hashKey(date)).not.toBe(hashKey(new Date()));
    });

    it('should support a custom `nextUidFn`', function() {
      var nextUidFn = jasmine.createSpy('nextUidFn').and.returnValues('foo', 'bar', 'baz', 'qux');

      var fn = function() {};
      var arr = [];
      var obj = {};
      var date = new Date();

      hashKey(fn, nextUidFn);
      hashKey(arr, nextUidFn);
      hashKey(obj, nextUidFn);
      hashKey(date, nextUidFn);

      expect(fn.$$hashKey).toBe('function:foo');
      expect(arr.$$hashKey).toBe('object:bar');
      expect(obj.$$hashKey).toBe('object:baz');
      expect(date.$$hashKey).toBe('object:qux');
    });
  });

  describe('NgMapShim', function() {
    it('should do basic crud', function() {
      var map = new NgMapShim();
      var keys = [{}, {}, {}];
      var values = [{}, {}, {}];

      map.set(keys[0], values[1]);
      map.set(keys[0], values[0]);
      expect(map.get(keys[0])).toBe(values[0]);
      expect(map.get(keys[1])).toBeUndefined();

      map.set(keys[1], values[1]);
      map.set(keys[2], values[2]);
      expect(map.delete(keys[0])).toBe(true);
      expect(map.delete(keys[0])).toBe(false);

      expect(map.get(keys[0])).toBeUndefined();
      expect(map.get(keys[1])).toBe(values[1]);
      expect(map.get(keys[2])).toBe(values[2]);
    });

    it('should be able to deal with `NaN` keys', function() {
      var map = new NgMapShim();

      map.set('NaN', 'foo');
      map.set(NaN, 'bar');
      map.set(NaN, 'baz');

      expect(map.get('NaN')).toBe('foo');
      expect(map.get(NaN)).toBe('baz');

      expect(map.delete(NaN)).toBe(true);
      expect(map.get(NaN)).toBeUndefined();
      expect(map.get('NaN')).toBe('foo');

      expect(map.delete(NaN)).toBe(false);
    });
  });
});

'use strict';

describe('$cookieStore', function() {

  beforeEach(module('ngCookies', {
    $cookies: jasmine.createSpyObj('$cookies', ['getObject', 'putObject', 'remove'])
  }));


  it('should get cookie', inject(function($cookieStore, $cookies) {
    $cookies.getObject.and.returnValue('value');
    expect($cookieStore.get('name')).toBe('value');
    expect($cookies.getObject).toHaveBeenCalledWith('name');
  }));


  it('should put cookie', inject(function($cookieStore, $cookies) {
    $cookieStore.put('name', 'value');
    expect($cookies.putObject).toHaveBeenCalledWith('name', 'value');
  }));


  it('should remove cookie', inject(function($cookieStore, $cookies) {
    $cookieStore.remove('name');
    expect($cookies.remove).toHaveBeenCalledWith('name');
  }));
 });
'use strict';

describe('$cookies', function() {
  var mockedCookies;

  beforeEach(function() {
    mockedCookies = {};
    module('ngCookies', {
      $$cookieWriter: jasmine.createSpy('$$cookieWriter').and.callFake(function(name, value) {
        mockedCookies[name] = value;
      }),
      $$cookieReader: function() {
        return mockedCookies;
      }
    });
  });


  it('should serialize objects to json', inject(function($cookies) {
    $cookies.putObject('objectCookie', {id: 123, name: 'blah'});
    expect($cookies.get('objectCookie')).toEqual('{"id":123,"name":"blah"}');
  }));


  it('should deserialize json to object', inject(function($cookies) {
    $cookies.put('objectCookie', '{"id":123,"name":"blah"}');
    expect($cookies.getObject('objectCookie')).toEqual({id: 123, name: 'blah'});
  }));


  it('should delete objects from the store when remove is called', inject(function($cookies) {
    $cookies.putObject('gonner', { 'I\'ll':'Be Back'});
    expect($cookies.get('gonner')).toEqual('{"I\'ll":"Be Back"}');
    $cookies.remove('gonner');
    expect($cookies.get('gonner')).toEqual(undefined);
  }));


  it('should handle empty string value cookies', inject(function($cookies) {
    $cookies.putObject('emptyCookie','');
    expect($cookies.get('emptyCookie')).toEqual('""');
    expect($cookies.getObject('emptyCookie')).toEqual('');
    mockedCookies['blankCookie'] = '';
    expect($cookies.getObject('blankCookie')).toEqual('');
  }));


  it('should put cookie value without serializing', inject(function($cookies) {
    $cookies.put('name', 'value');
    $cookies.put('name2', '"value2"');
    expect($cookies.get('name')).toEqual('value');
    expect($cookies.getObject('name2')).toEqual('value2');
  }));


  it('should get cookie value without deserializing', inject(function($cookies) {
    $cookies.put('name', 'value');
    $cookies.putObject('name2', 'value2');
    expect($cookies.get('name')).toEqual('value');
    expect($cookies.get('name2')).toEqual('"value2"');
  }));

  it('should get all the cookies', inject(function($cookies) {
    $cookies.put('name', 'value');
    $cookies.putObject('name2', 'value2');
    expect($cookies.getAll()).toEqual({name: 'value', name2: '"value2"'});
  }));


  it('should pass options on put', inject(function($cookies, $$cookieWriter) {
    $cookies.put('name', 'value', {path: '/a/b'});
    expect($$cookieWriter).toHaveBeenCalledWith('name', 'value', {path: '/a/b'});
  }));


  it('should pass options on putObject', inject(function($cookies, $$cookieWriter) {
    $cookies.putObject('name', 'value', {path: '/a/b'});
    expect($$cookieWriter).toHaveBeenCalledWith('name', '"value"', {path: '/a/b'});
  }));


  it('should pass options on remove', inject(function($cookies, $$cookieWriter) {
    $cookies.remove('name', {path: '/a/b'});
    expect($$cookieWriter).toHaveBeenCalledWith('name', undefined, {path: '/a/b'});
  }));


  it('should pass default options on put', function() {
    module(function($cookiesProvider) {
      $cookiesProvider.defaults.secure = true;
    });
    inject(function($cookies, $$cookieWriter) {
      $cookies.put('name', 'value', {path: '/a/b'});
      expect($$cookieWriter).toHaveBeenCalledWith('name', 'value', {path: '/a/b', secure: true});
    });
  });


  it('should pass default options on putObject', function() {
    module(function($cookiesProvider) {
      $cookiesProvider.defaults.secure = true;
    });
    inject(function($cookies, $$cookieWriter) {
      $cookies.putObject('name', 'value', {path: '/a/b'});
      expect($$cookieWriter).toHaveBeenCalledWith('name', '"value"', {path: '/a/b', secure: true});
    });
  });


  it('should pass default options on remove', function() {
    module(function($cookiesProvider) {
      $cookiesProvider.defaults.secure = true;
    });
    inject(function($cookies, $$cookieWriter) {
      $cookies.remove('name', {path: '/a/b'});
      expect($$cookieWriter).toHaveBeenCalledWith('name', undefined, {path: '/a/b', secure: true});
    });
  });


  it('should let passed options override default options', function() {
    module(function($cookiesProvider) {
      $cookiesProvider.defaults.secure = true;
    });
    inject(function($cookies, $$cookieWriter) {
      $cookies.put('name', 'value', {secure: false});
      expect($$cookieWriter).toHaveBeenCalledWith('name', 'value', {secure: false});
    });
  });


  it('should pass default options if no options are passed', function() {
    module(function($cookiesProvider) {
      $cookiesProvider.defaults.secure = true;
    });
    inject(function($cookies, $$cookieWriter) {
      $cookies.put('name', 'value');
      expect($$cookieWriter).toHaveBeenCalledWith('name', 'value', {secure: true});
    });
  });

 });
'use strict';

describe('$$cookieWriter', function() {
  var $$cookieWriter, document;

  function deleteAllCookies() {
    var cookies = document.cookie.split(';');
    var path = window.location.pathname;

    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i];
      var eqPos = cookie.indexOf('=');
      var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      var parts = path.split('/');
      while (parts.length) {
        document.cookie = name + '=;path=' + (parts.join('/') || '/') + ';expires=Thu, 01 Jan 1970 00:00:00 GMT';
        parts.pop();
      }
    }
  }

  beforeEach(function() {
    document = window.document;
    deleteAllCookies();
    expect(document.cookie).toEqual('');

    module('ngCookies');
    inject(function(_$$cookieWriter_) {
      $$cookieWriter = _$$cookieWriter_;
    });
  });


  afterEach(function() {
    deleteAllCookies();
    expect(document.cookie).toEqual('');
  });


  describe('remove via $$cookieWriter(cookieName, undefined)', function() {

    it('should remove a cookie when it is present', function() {
      document.cookie = 'foo=bar;path=/';

      $$cookieWriter('foo', undefined);

      expect(document.cookie).toEqual('');
    });


    it('should do nothing when an nonexisting cookie is being removed', function() {
      $$cookieWriter('doesntexist', undefined);
      expect(document.cookie).toEqual('');
    });
  });


  describe('put via $$cookieWriter(cookieName, string)', function() {

    it('should create and store a cookie', function() {
      $$cookieWriter('cookieName', 'cookie=Value');
      expect(document.cookie).toMatch(/cookieName=cookie%3DValue;? ?/);
    });


    it('should overwrite an existing unsynced cookie', function() {
      document.cookie = 'cookie=new;path=/';

      var oldVal = $$cookieWriter('cookie', 'newer');

      expect(document.cookie).toEqual('cookie=newer');
      expect(oldVal).not.toBeDefined();
    });

    it('should encode both name and value', function() {
      $$cookieWriter('cookie1=', 'val;ue');
      $$cookieWriter('cookie2=bar;baz', 'val=ue');

      var rawCookies = document.cookie.split('; '); //order is not guaranteed, so we need to parse
      expect(rawCookies.length).toEqual(2);
      expect(rawCookies).toContain('cookie1%3D=val%3Bue');
      expect(rawCookies).toContain('cookie2%3Dbar%3Bbaz=val%3Due');
    });

    it('should log warnings when 4kb per cookie storage limit is reached', inject(function($log) {
      var i, longVal = '', cookieStr;

      for (i = 0; i < 4083; i++) {
        longVal += 'x';
      }

      cookieStr = document.cookie;
      $$cookieWriter('x', longVal); //total size 4093-4096, so it should go through
      expect(document.cookie).not.toEqual(cookieStr);
      expect(document.cookie).toEqual('x=' + longVal);
      expect($log.warn.logs).toEqual([]);

      $$cookieWriter('x', longVal + 'xxxx'); //total size 4097-4099, a warning should be logged
      expect($log.warn.logs).toEqual(
        [['Cookie \'x\' possibly not set or overflowed because it was too large (4097 > 4096 ' +
           'bytes)!']]);

      //force browser to dropped a cookie and make sure that the cache is not out of sync
      $$cookieWriter('x', 'shortVal');
      expect(document.cookie).toEqual('x=shortVal'); //needed to prime the cache
      cookieStr = document.cookie;
      $$cookieWriter('x', longVal + longVal + longVal); //should be too long for all browsers

      if (document.cookie !== cookieStr) {
        this.fail(new Error('browser didn\'t drop long cookie when it was expected. make the ' +
            'cookie in this test longer'));
      }

      expect(document.cookie).toEqual('x=shortVal');
      $log.reset();
    }));
  });

  describe('put via $$cookieWriter(cookieName, string), if no <base href> ', function() {
    beforeEach(inject(function($browser) {
      $browser.$$baseHref = undefined;
    }));

    it('should default path in cookie to "" (empty string)', function() {
      $$cookieWriter('cookie', 'bender');
      // This only fails in Safari and IE when cookiePath returns undefined
      // Where it now succeeds since baseHref return '' instead of undefined
      expect(document.cookie).toEqual('cookie=bender');
    });
  });
});

describe('cookie options', function() {
  var fakeDocument, $$cookieWriter;

  function getLastCookieAssignment(key) {
    return fakeDocument[0].cookie
              .split(';')
              .reduce(function(prev, value) {
                var pair = value.split('=', 2);
                if (pair[0] === key) {
                  if (isUndefined(prev)) {
                    return isUndefined(pair[1]) ? true : pair[1];
                  } else {
                    throw new Error('duplicate key in cookie string');
                  }
                } else {
                  return prev;
                }
              }, undefined);
  }

  beforeEach(function() {
    fakeDocument = [{cookie: ''}];
    module('ngCookies', {$document: fakeDocument});
    inject(function($browser) {
      $browser.$$baseHref = '/a/b';
    });
    inject(function(_$$cookieWriter_) {
      $$cookieWriter = _$$cookieWriter_;
    });
  });

  it('should use baseHref as default path', function() {
    $$cookieWriter('name', 'value');
    expect(getLastCookieAssignment('path')).toBe('/a/b');
  });

  it('should accept path option', function() {
    $$cookieWriter('name', 'value', {path: '/c/d'});
    expect(getLastCookieAssignment('path')).toBe('/c/d');
  });

  it('should accept domain option', function() {
    $$cookieWriter('name', 'value', {domain: '.example.com'});
    expect(getLastCookieAssignment('domain')).toBe('.example.com');
  });

  it('should accept secure option', function() {
    $$cookieWriter('name', 'value', {secure: true});
    expect(getLastCookieAssignment('secure')).toBe(true);
  });

  it('should accept expires option on set', function() {
    $$cookieWriter('name', 'value', {expires: 'Fri, 19 Dec 2014 00:00:00 GMT'});
    expect(getLastCookieAssignment('expires')).toMatch(/^Fri, 19 Dec 2014 00:00:00 (UTC|GMT)$/);
  });

  it('should always use epoch time as expire time on remove', function() {
    $$cookieWriter('name', undefined, {expires: 'Fri, 19 Dec 2014 00:00:00 GMT'});
    expect(getLastCookieAssignment('expires')).toMatch(/^Thu, 0?1 Jan 1970 00:00:00 (UTC|GMT)$/);
  });

  it('should accept date object as expires option', function() {
    $$cookieWriter('name', 'value', {expires: new Date(Date.UTC(1981, 11, 27))});
    expect(getLastCookieAssignment('expires')).toMatch(/^Sun, 27 Dec 1981 00:00:00 (UTC|GMT)$/);
  });

});
'use strict';

describe('errors', function() {
  var originalObjectMaxDepthInErrorMessage = minErrConfig.objectMaxDepth;

  afterEach(function() {
    minErrConfig.objectMaxDepth = originalObjectMaxDepthInErrorMessage;
  });

  describe('errorHandlingConfig', function() {
    it('should get default objectMaxDepth', function() {
      expect(errorHandlingConfig().objectMaxDepth).toBe(5);
    });

    it('should set objectMaxDepth', function() {
      errorHandlingConfig({objectMaxDepth: 3});
      expect(errorHandlingConfig().objectMaxDepth).toBe(3);
    });

    it('should not change objectMaxDepth when undefined is supplied', function() {
      errorHandlingConfig({objectMaxDepth: undefined});
      expect(errorHandlingConfig().objectMaxDepth).toBe(originalObjectMaxDepthInErrorMessage);
    });

    they('should set objectMaxDepth to NaN when $prop is supplied',
        [NaN, null, true, false, -1, 0], function(maxDepth) {
          errorHandlingConfig({objectMaxDepth: maxDepth});
          expect(errorHandlingConfig().objectMaxDepth).toBeNaN();
        }
    );
  });

  describe('minErr', function() {

    var supportStackTraces = function() {
      var e = new Error();
      return isDefined(e.stack);
    };
    var emptyTestError = minErr(),
      testError = minErr('test');

    it('should return an Error factory', function() {
      var myError = testError('test', 'Oops');
      expect(myError instanceof Error).toBe(true);
    });

    it('should generate stack trace at the frame where the minErr instance was called', function() {
      var myError;

      function someFn() {
        function nestedFn() {
          myError = testError('fail', 'I fail!');
        }
        nestedFn();
      }

      someFn();

      // only Chrome, Firefox have stack
      if (!supportStackTraces()) return;

      expect(myError.stack).toMatch(/^[.\s\S]+nestedFn[.\s\S]+someFn.+/);
    });

    it('should interpolate string arguments without quotes', function() {
      var myError = testError('1', 'This {0} is "{1}"', 'foo', 'bar');
      expect(myError.message).toMatch(/^\[test:1] This foo is "bar"/);
    });

    it('should interpolate non-string arguments', function() {
      var arr = [1, 2, 3],
          obj = {a: 123, b: 'baar'},
          anonFn = function(something) { return something; },
          namedFn = function foo(something) { return something; },
          myError;

      myError = testError('26', 'arr: {0}; obj: {1}; anonFn: {2}; namedFn: {3}',
                                arr,      obj,      anonFn,      namedFn);

      expect(myError.message).toContain('[test:26] arr: [1,2,3]; obj: {"a":123,"b":"baar"};');
    // Support: IE 9-11 only
      // IE does not add space after "function"
      expect(myError.message).toMatch(/anonFn: function\s?\(something\);/);
      expect(myError.message).toContain('namedFn: function foo(something)');
    });

    it('should not suppress falsy objects', function() {
      var myError = testError('26', 'false: {0}; zero: {1}; null: {2}; undefined: {3}; emptyStr: {4}',
                                    false,      0,         null,      undefined,      '');
      expect(myError.message).
          toMatch(/^\[test:26] false: false; zero: 0; null: null; undefined: undefined; emptyStr: /);
    });

    it('should handle arguments that are objects with cyclic references', function() {
      var a = { b: { } };
      a.b.a = a;

      var myError = testError('26', 'a is {0}', a);
      expect(myError.message).toMatch(/a is {"b":{"a":"..."}}/);
    });

    it('should handle arguments that are objects with max depth', function() {
      var a = {b: {c: {d: {e: {f: {g: 1}}}}}};

      var myError = testError('26', 'a when objectMaxDepth is default=5 is {0}', a);
      expect(myError.message).toMatch(/a when objectMaxDepth is default=5 is {"b":{"c":{"d":{"e":{"f":"..."}}}}}/);

      errorHandlingConfig({objectMaxDepth: 1});
      myError = testError('26', 'a when objectMaxDepth is set to 1 is {0}', a);
      expect(myError.message).toMatch(/a when objectMaxDepth is set to 1 is {"b":"..."}/);

      errorHandlingConfig({objectMaxDepth: 2});
      myError = testError('26', 'a when objectMaxDepth is set to 2 is {0}', a);
      expect(myError.message).toMatch(/a when objectMaxDepth is set to 2 is {"b":{"c":"..."}}/);

      errorHandlingConfig({objectMaxDepth: undefined});
      myError = testError('26', 'a when objectMaxDepth is set to undefined is {0}', a);
      expect(myError.message).toMatch(/a when objectMaxDepth is set to undefined is {"b":{"c":"..."}}/);
    });

    they('should handle arguments that are objects and ignore max depth when objectMaxDepth = $prop',
      [NaN, null, true, false, -1, 0], function(maxDepth) {
        var a = {b: {c: {d: {e: {f: {g: 1}}}}}};

        errorHandlingConfig({objectMaxDepth: maxDepth});
        var myError = testError('26', 'a is {0}', a);
        expect(myError.message).toMatch(/a is {"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}/);
      }
    );

    it('should preserve interpolation markers when fewer arguments than needed are provided', function() {
      // this way we can easily see if we are passing fewer args than needed

      var foo = 'Fooooo',
          myError = testError('26', 'This {0} is {1} on {2}', foo);

      expect(myError.message).toMatch(/^\[test:26] This Fooooo is \{1\} on \{2\}/);
    });


    it('should pass through the message if no interpolation is needed', function() {
      var myError = testError('26', 'Something horrible happened!');
      expect(myError.message).toMatch(/^\[test:26] Something horrible happened!/);
    });

    it('should include a namespace in the message only if it is namespaced', function() {
      var myError = emptyTestError('26', 'This is a {0}', 'Foo');
      var myNamespacedError = testError('26', 'That is a {0}', 'Bar');
      expect(myError.message).toMatch(/^\[26] This is a Foo/);
      expect(myNamespacedError.message).toMatch(/^\[test:26] That is a Bar/);
    });


    it('should accept an optional 2nd argument to construct custom errors', function() {
      var normalMinErr = minErr('normal');
      expect(normalMinErr('acode', 'aproblem') instanceof TypeError).toBe(false);
      var typeMinErr = minErr('type', TypeError);
      expect(typeMinErr('acode', 'aproblem') instanceof TypeError).toBe(true);
    });


    it('should include a properly formatted error reference URL in the message', function() {
      // to avoid maintaining the root URL in two locations, we only validate the parameters
      expect(testError('acode', 'aproblem', 'a', 'b', 'value with space').message)
        .toMatch(/^[\s\S]*\?p0=a&p1=b&p2=value%20with%20space$/);
    });
  });
});
'use strict';

describe('ngMessages', function() {
  beforeEach(inject.strictDi());
  beforeEach(module('ngMessages'));

  function messageChildren(element) {
    return (element.length ? element[0] : element).querySelectorAll('[ng-message], [ng-message-exp]');
  }

  function s(str) {
    return str.replace(/\s+/g,'');
  }

  function trim(value) {
    return isString(value) ? value.trim() : value;
  }

  var element;
  afterEach(function() {
    dealoc(element);
  });

  it('should render based off of a hashmap collection', inject(function($rootScope, $compile) {
    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message="val">Message is set</div>' +
                       '</div>')($rootScope);
    $rootScope.$digest();

    expect(element.text()).not.toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { val: true };
    });

    expect(element.text()).toContain('Message is set');
  }));

  it('should render the same message if multiple message keys match', inject(function($rootScope, $compile) {
    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message="one, two, three">Message is set</div>' +
                       '</div>')($rootScope);
    $rootScope.$digest();

    expect(element.text()).not.toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { one: true };
    });

    expect(element.text()).toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { two: true, one: false };
    });

    expect(element.text()).toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { three: true, two: false };
    });

    expect(element.text()).toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { three: false };
    });

    expect(element.text()).not.toContain('Message is set');
  }));

  it('should use the when attribute when an element directive is used',
    inject(function($rootScope, $compile) {

    element = $compile('<ng-messages for="col">' +
                       '  <ng-message when="val">Message is set</div>' +
                       '</ng-messages>')($rootScope);
    $rootScope.$digest();

    expect(element.text()).not.toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { val: true };
    });

    expect(element.text()).toContain('Message is set');
  }));

  it('should render the same message if multiple message keys match based on the when attribute', inject(function($rootScope, $compile) {
    element = $compile('<ng-messages for="col">' +
                       '  <ng-message when=" one two three ">Message is set</div>' +
                       '</ng-messages>')($rootScope);
    $rootScope.$digest();

    expect(element.text()).not.toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { one: true };
    });

    expect(element.text()).toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { two: true, one: false };
    });

    expect(element.text()).toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { three: true, two: false };
    });

    expect(element.text()).toContain('Message is set');

    $rootScope.$apply(function() {
      $rootScope.col = { three: false };
    });

    expect(element.text()).not.toContain('Message is set');
  }));

  it('should allow a dynamic expression to be set when ng-message-exp is used',
    inject(function($rootScope, $compile) {

    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message-exp="variable">Message is crazy</div>' +
                       '</div>')($rootScope);
    $rootScope.$digest();

    expect(element.text()).not.toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.variable = 'error';
      $rootScope.col = { error: true };
    });

    expect(element.text()).toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.col = { error: false, failure: true };
    });

    expect(element.text()).not.toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.variable = ['failure'];
    });

    expect(element.text()).toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.variable = null;
    });

    expect(element.text()).not.toContain('Message is crazy');
  }));

  it('should allow a dynamic expression to be set when the when-exp attribute is used',
    inject(function($rootScope, $compile) {

    element = $compile('<ng-messages for="col">' +
                       '  <ng-message when-exp="variable">Message is crazy</ng-message>' +
                       '</ng-messages>')($rootScope);
    $rootScope.$digest();

    expect(element.text()).not.toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.variable = 'error, failure';
      $rootScope.col = { error: true };
    });

    expect(element.text()).toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.col = { error: false, failure: true };
    });

    expect(element.text()).toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.variable = [];
    });

    expect(element.text()).not.toContain('Message is crazy');

    $rootScope.$apply(function() {
      $rootScope.variable = null;
    });

    expect(element.text()).not.toContain('Message is crazy');
  }));

  they('should render empty when $prop is used as a collection value',
    { 'null': null,
      'false': false,
      '0': 0,
      '[]': [],
      '[{}]': [{}],
      '': '',
      '{ val2 : true }': { val2: true } },
  function(prop) {
    inject(function($rootScope, $compile) {
      element = $compile('<div ng-messages="col">' +
                         '  <div ng-message="val">Message is set</div>' +
                         '</div>')($rootScope);
      $rootScope.$digest();

      $rootScope.$apply(function() {
        $rootScope.col = prop;
      });
      expect(element.text()).not.toContain('Message is set');
    });
  });

  they('should insert and remove matching inner elements when $prop is used as a value',
    { 'true': true,
      '1': 1,
      '{}': {},
      '[]': [],
      '[null]': [null] },
  function(prop) {
    inject(function($rootScope, $compile) {

      element = $compile('<div ng-messages="col">' +
                         '  <div ng-message="blue">This message is blue</div>' +
                         '  <div ng-message="red">This message is red</div>' +
                         '</div>')($rootScope);

      $rootScope.$apply(function() {
        $rootScope.col = {};
      });

      expect(messageChildren(element).length).toBe(0);
      expect(trim(element.text())).toEqual('');

      $rootScope.$apply(function() {
        $rootScope.col = {
          blue: true,
          red: false
        };
      });

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('This message is blue');

      $rootScope.$apply(function() {
        $rootScope.col = {
          red: prop
        };
      });

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('This message is red');

      $rootScope.$apply(function() {
        $rootScope.col = null;
      });
      expect(messageChildren(element).length).toBe(0);
      expect(trim(element.text())).toEqual('');


      $rootScope.$apply(function() {
        $rootScope.col = {
          blue: 0,
          red: null
        };
      });

      expect(messageChildren(element).length).toBe(0);
      expect(trim(element.text())).toEqual('');
    });
  });

  it('should display the elements in the order defined in the DOM',
    inject(function($rootScope, $compile) {

    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message="one">Message#one</div>' +
                       '  <div ng-message="two">Message#two</div>' +
                       '  <div ng-message="three">Message#three</div>' +
                       '</div>')($rootScope);

    $rootScope.$apply(function() {
      $rootScope.col = {
        three: true,
        one: true,
        two: true
      };
    });

    angular.forEach(['one','two','three'], function(key) {
      expect(s(element.text())).toEqual('Message#' + key);

      $rootScope.$apply(function() {
        $rootScope.col[key] = false;
      });
    });

    expect(s(element.text())).toEqual('');
  }));

  it('should add ng-active/ng-inactive CSS classes to the element when errors are/aren\'t displayed',
    inject(function($rootScope, $compile) {

    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message="ready">This message is ready</div>' +
                       '</div>')($rootScope);

    $rootScope.$apply(function() {
      $rootScope.col = {};
    });

    expect(element.hasClass('ng-active')).toBe(false);
    expect(element.hasClass('ng-inactive')).toBe(true);

    $rootScope.$apply(function() {
      $rootScope.col = { ready: true };
    });

    expect(element.hasClass('ng-active')).toBe(true);
    expect(element.hasClass('ng-inactive')).toBe(false);
  }));

  it('should automatically re-render the messages when other directives dynamically change them',
    inject(function($rootScope, $compile) {

    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message="primary">Enter something</div>' +
                       '  <div ng-repeat="item in items">' +
                       '    <div ng-message-exp="item.name">{{ item.text }}</div>' +
                       '  </div>' +
                       '</div>')($rootScope);

    $rootScope.$apply(function() {
      $rootScope.col = {};
      $rootScope.items = [
        { text: 'Your age is incorrect', name: 'age' },
        { text: 'You\'re too tall man!', name: 'height' },
        { text: 'Your hair is too long', name: 'hair' }
      ];
    });

    expect(messageChildren(element).length).toBe(0);
    expect(trim(element.text())).toEqual('');

    $rootScope.$apply(function() {
      $rootScope.col = { hair: true };
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('Your hair is too long');

    $rootScope.$apply(function() {
      $rootScope.col = { age: true, hair: true};
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('Your age is incorrect');

    $rootScope.$apply(function() {
      // remove the age!
      $rootScope.items.shift();
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('Your hair is too long');

    $rootScope.$apply(function() {
      // remove the hair!
      $rootScope.items.length = 0;
      $rootScope.col.primary = true;
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('Enter something');
  }));


  it('should be compatible with ngBind',
    inject(function($rootScope, $compile) {

    element = $compile('<div ng-messages="col">' +
                       '        <div ng-message="required" ng-bind="errorMessages.required"></div>' +
                       '        <div ng-message="extra" ng-bind="errorMessages.extra"></div>' +
                       '</div>')($rootScope);

    $rootScope.$apply(function() {
      $rootScope.col = {
        required: true,
        extra: true
      };
      $rootScope.errorMessages = {
        required: 'Fill in the text field.',
        extra: 'Extra error message.'
      };
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('Fill in the text field.');

    $rootScope.$apply(function() {
      $rootScope.col.required = false;
      $rootScope.col.extra = true;
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('Extra error message.');

    $rootScope.$apply(function() {
      $rootScope.errorMessages.extra = 'New error message.';
    });

    expect(messageChildren(element).length).toBe(1);
    expect(trim(element.text())).toEqual('New error message.');
  }));


  // issue #12856
  it('should only detach the message object that is associated with the message node being removed',
    inject(function($rootScope, $compile, $animate) {

    // We are going to spy on the `leave` method to give us control over
    // when the element is actually removed
    spyOn($animate, 'leave');

    // Create a basic ng-messages set up
    element = $compile('<div ng-messages="col">' +
                       '  <div ng-message="primary">Enter something</div>' +
                       '</div>')($rootScope);

    // Trigger the message to be displayed
    $rootScope.col = { primary: true };
    $rootScope.$digest();
    expect(messageChildren(element).length).toEqual(1);
    var oldMessageNode = messageChildren(element)[0];

    // Remove the message
    $rootScope.col = { primary: undefined };
    $rootScope.$digest();

    // Since we have spied on the `leave` method, the message node is still in the DOM
    expect($animate.leave).toHaveBeenCalledOnce();
    var nodeToRemove = $animate.leave.calls.mostRecent().args[0][0];
    expect(nodeToRemove).toBe(oldMessageNode);
    $animate.leave.calls.reset();

    // Add the message back in
    $rootScope.col = { primary: true };
    $rootScope.$digest();

    // Simulate the animation completing on the node
    jqLite(nodeToRemove).remove();

    // We should not get another call to `leave`
    expect($animate.leave).not.toHaveBeenCalled();

    // There should only be the new message node
    expect(messageChildren(element).length).toEqual(1);
    var newMessageNode = messageChildren(element)[0];
    expect(newMessageNode).not.toBe(oldMessageNode);
  }));

  it('should render animations when the active/inactive classes are added/removed', function() {
    module('ngAnimate');
    module('ngAnimateMock');
    inject(function($rootScope, $compile, $animate) {
      element = $compile('<div ng-messages="col">' +
                         '  <div ng-message="ready">This message is ready</div>' +
                         '</div>')($rootScope);

      $rootScope.$apply(function() {
        $rootScope.col = {};
      });

      var event = $animate.queue.pop();
      expect(event.event).toBe('setClass');
      expect(event.args[1]).toBe('ng-inactive');
      expect(event.args[2]).toBe('ng-active');

      $rootScope.$apply(function() {
        $rootScope.col = { ready: true };
      });

      event = $animate.queue.pop();
      expect(event.event).toBe('setClass');
      expect(event.args[1]).toBe('ng-active');
      expect(event.args[2]).toBe('ng-inactive');
    });
  });

  describe('ngMessage nested nested inside elements', function() {

    it('should not crash or leak memory when the messages are transcluded, the first message is ' +
      'visible, and ngMessages is removed by ngIf', function() {

      module(function($compileProvider) {
        $compileProvider.directive('messageWrap', function() {
          return {
            transclude: true,
            scope: {
              col: '=col'
            },
            template: '<div ng-messages="col"><ng-transclude></ng-transclude></div>'
          };
        });
      });

      inject(function($rootScope, $compile) {

        element = $compile('<div><div ng-if="show"><div message-wrap col="col">' +
                           '        <div ng-message="a">A</div>' +
                           '        <div ng-message="b">B</div>' +
                           '</div></div></div>')($rootScope);

        $rootScope.$apply(function() {
          $rootScope.show = true;
          $rootScope.col = {
            a: true,
            b: true
          };
        });

        expect(messageChildren(element).length).toBe(1);
        expect(trim(element.text())).toEqual('A');

        $rootScope.$apply('show = false');

        expect(messageChildren(element).length).toBe(0);
      });
    });


    it('should not crash when the first of two nested messages is removed', function() {
      inject(function($rootScope, $compile) {

        element = $compile(
          '<div ng-messages="col">' +
            '<div class="wrapper">' +
              '<div remove-me ng-message="a">A</div>' +
              '<div ng-message="b">B</div>' +
            '</div>' +
          '</div>'
        )($rootScope);

        $rootScope.$apply(function() {
          $rootScope.col = {
            a: true,
            b: false
          };
        });

        expect(messageChildren(element).length).toBe(1);
        expect(trim(element.text())).toEqual('A');

        var ctrl = element.controller('ngMessages');
        var deregisterSpy = spyOn(ctrl, 'deregister').and.callThrough();

        var nodeA = element[0].querySelector('[ng-message="a"]');
        jqLite(nodeA).remove();
        $rootScope.$digest(); // The next digest triggers the error

        // Make sure removing the element triggers the deregistration in ngMessages
        expect(trim(deregisterSpy.calls.mostRecent().args[0].nodeValue)).toBe('ngMessage: a');
        expect(messageChildren(element).length).toBe(0);
      });
    });


    it('should not crash, but show deeply nested messages correctly after a message ' +
      'has been removed', function() {
      inject(function($rootScope, $compile) {

        element = $compile(
          '<div ng-messages="col" ng-messages-multiple>' +
            '<div class="another-wrapper">' +
              '<div ng-message="a">A</div>' +
              '<div class="wrapper">' +
                '<div ng-message="b">B</div>' +
                '<div ng-message="c">C</div>' +
              '</div>' +
              '<div ng-message="d">D</div>' +
            '</div>' +
          '</div>'
        )($rootScope);

        $rootScope.$apply(function() {
          $rootScope.col = {
            a: true,
            b: true
          };
        });

        expect(messageChildren(element).length).toBe(2);
        expect(trim(element.text())).toEqual('AB');

        var ctrl = element.controller('ngMessages');
        var deregisterSpy = spyOn(ctrl, 'deregister').and.callThrough();

        var nodeB = element[0].querySelector('[ng-message="b"]');
        jqLite(nodeB).remove();
        $rootScope.$digest(); // The next digest triggers the error

        // Make sure removing the element triggers the deregistration in ngMessages
        expect(trim(deregisterSpy.calls.mostRecent().args[0].nodeValue)).toBe('ngMessage: b');
        expect(messageChildren(element).length).toBe(1);
        expect(trim(element.text())).toEqual('A');
      });
    });
  });


  it('should clean-up the ngMessage scope when a message is removed',
    inject(function($compile, $rootScope) {

      var html =
          '<div ng-messages="items">' +
            '<div ng-message="a">{{forA}}</div>' +
          '</div>';

      element = $compile(html)($rootScope);
      $rootScope.$apply(function() {
        $rootScope.forA = 'A';
        $rootScope.items = {a: true};
      });

      expect(element.text()).toBe('A');
      var watchers = $rootScope.$countWatchers();

      $rootScope.$apply('items.a = false');

      expect(element.text()).toBe('');
      // We don't know exactly how many watchers are on the scope, only that there should be
      // one less now
      expect($rootScope.$countWatchers()).toBe(watchers - 1);
    })
  );


  describe('when including templates', function() {
    they('should work with a dynamic collection model which is managed by ngRepeat',
      {'<div ng-messages-include="...">': '<div ng-messages="item">' +
                                            '<div ng-messages-include="abc.html"></div>' +
                                          '</div>',
       '<ng-messages-include src="...">': '<ng-messages for="item">' +
                                            '<ng-messages-include src="abc.html"></ng-messages-include>' +
                                          '</ng-messages>'},
    function(html) {
      inject(function($compile, $rootScope, $templateCache) {
        $templateCache.put('abc.html', '<div ng-message="a">A</div>' +
                                       '<div ng-message="b">B</div>' +
                                       '<div ng-message="c">C</div>');

        html = '<div><div ng-repeat="item in items">' + html + '</div></div>';
        $rootScope.items = [{},{},{}];

        element = $compile(html)($rootScope);
        $rootScope.$apply(function() {
          $rootScope.items[0].a = true;
          $rootScope.items[1].b = true;
          $rootScope.items[2].c = true;
        });

        var elements = element[0].querySelectorAll('[ng-repeat]');

        // all three collections should have at least one error showing up
        expect(messageChildren(element).length).toBe(3);
        expect(messageChildren(elements[0]).length).toBe(1);
        expect(messageChildren(elements[1]).length).toBe(1);
        expect(messageChildren(elements[2]).length).toBe(1);

        // this is the standard order of the displayed error messages
        expect(element.text().trim()).toBe('ABC');

        $rootScope.$apply(function() {
          $rootScope.items[0].a = false;
          $rootScope.items[0].c = true;

          $rootScope.items[1].b = false;

          $rootScope.items[2].c = false;
          $rootScope.items[2].a = true;
        });

        // with the 2nd item gone and the values changed
        // we should see both 1 and 3 changed
        expect(element.text().trim()).toBe('CA');

        $rootScope.$apply(function() {
          // add the value for the 2nd item back
          $rootScope.items[1].b = true;
          $rootScope.items.reverse();
        });

        // when reversed we get back to our original value
        expect(element.text().trim()).toBe('ABC');
      });
    });

    they('should remove the $prop element and place a comment anchor node where it used to be',
      {'<div ng-messages-include="...">': '<div ng-messages="data">' +
                                            '<div ng-messages-include="abc.html"></div>' +
                                          '</div>',
       '<ng-messages-include src="...">': '<ng-messages for="data">' +
                                            '<ng-messages-include src="abc.html"></ng-messages-include>' +
                                          '</ng-messages>'},
    function(html) {
      inject(function($compile, $rootScope, $templateCache) {
        $templateCache.put('abc.html', '<div></div>');

        element = $compile(html)($rootScope);
        $rootScope.$digest();

        var includeElement = element[0].querySelector('[ng-messages-include], ng-messages-include');
        expect(includeElement).toBeFalsy();

        var comment = element[0].childNodes[0];
        expect(comment.nodeType).toBe(8);
        expect(comment.nodeValue).toBe(' ngMessagesInclude: abc.html ');
      });
    });

    they('should load a remote template using $prop',
      {'<div ng-messages-include="...">': '<div ng-messages="data">' +
                                            '<div ng-messages-include="abc.html"></div>' +
                                          '</div>',
       '<ng-messages-include src="...">': '<ng-messages for="data">' +
                                            '<ng-messages-include src="abc.html"></ng-messages-include>' +
                                          '</ng-messages>'},
    function(html) {
      inject(function($compile, $rootScope, $templateCache) {
        $templateCache.put('abc.html', '<div ng-message="a">A</div>' +
                                       '<div ng-message="b">B</div>' +
                                       '<div ng-message="c">C</div>');

        element = $compile(html)($rootScope);
        $rootScope.$apply(function() {
          $rootScope.data = {
            'a': 1,
            'b': 2,
            'c': 3
          };
        });

        expect(messageChildren(element).length).toBe(1);
        expect(trim(element.text())).toEqual('A');

        $rootScope.$apply(function() {
          $rootScope.data = {
            'c': 3
          };
        });

        expect(messageChildren(element).length).toBe(1);
        expect(trim(element.text())).toEqual('C');
      });
    });

    it('should cache the template after download',
      inject(function($rootScope, $compile, $templateCache, $httpBackend) {

      $httpBackend.expect('GET', 'tpl').respond(201, '<div>abc</div>');

      expect($templateCache.get('tpl')).toBeUndefined();

      element = $compile('<div ng-messages="data"><div ng-messages-include="tpl"></div></div>')($rootScope);

      $rootScope.$digest();
      $httpBackend.flush();

      expect($templateCache.get('tpl')).toBeDefined();
    }));

    it('should re-render the messages after download without an extra digest',
      inject(function($rootScope, $compile, $httpBackend) {

      $httpBackend.expect('GET', 'my-messages').respond(201,
        '<div ng-message="required">You did not enter a value</div>');

      element = $compile('<div ng-messages="data">' +
                         '  <div ng-messages-include="my-messages"></div>' +
                         '  <div ng-message="failed">Your value is that of failure</div>' +
                         '</div>')($rootScope);

      $rootScope.data = {
        required: true,
        failed: true
      };

      $rootScope.$digest();

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('Your value is that of failure');

      $httpBackend.flush();
      $rootScope.$digest();

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('You did not enter a value');
    }));

    it('should allow for overriding the remote template messages within the element depending on where the remote template is placed',
      inject(function($compile, $rootScope, $templateCache) {

      $templateCache.put('abc.html', '<div ng-message="a">A</div>' +
                                     '<div ng-message="b">B</div>' +
                                     '<div ng-message="c">C</div>');

      element = $compile('<div ng-messages="data">' +
                         '  <div ng-message="a">AAA</div>' +
                         '  <div ng-messages-include="abc.html"></div>' +
                         '  <div ng-message="c">CCC</div>' +
                         '</div>')($rootScope);

      $rootScope.$apply(function() {
        $rootScope.data = {
          'a': 1,
          'b': 2,
          'c': 3
        };
      });

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('AAA');

      $rootScope.$apply(function() {
        $rootScope.data = {
          'b': 2,
          'c': 3
        };
      });

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('B');

      $rootScope.$apply(function() {
        $rootScope.data = {
          'c': 3
        };
      });

      expect(messageChildren(element).length).toBe(1);
      expect(trim(element.text())).toEqual('C');
    }));

    it('should properly detect a previous message, even if it was registered later',
      inject(function($compile, $rootScope, $templateCache) {
        $templateCache.put('include.html', '<div ng-message="a">A</div>');
        var html =
            '<div ng-messages="items">' +
              '<div ng-include="\'include.html\'"></div>' +
              '<div ng-message="b">B</div>' +
              '<div ng-message="c">C</div>' +
            '</div>';

        element = $compile(html)($rootScope);
        $rootScope.$apply('items = {b: true, c: true}');

        expect(element.text()).toBe('B');

        var ctrl = element.controller('ngMessages');
        var deregisterSpy = spyOn(ctrl, 'deregister').and.callThrough();

        var nodeB = element[0].querySelector('[ng-message="b"]');
        jqLite(nodeB).remove();

        // Make sure removing the element triggers the deregistration in ngMessages
        expect(trim(deregisterSpy.calls.mostRecent().args[0].nodeValue)).toBe('ngMessage: b');

        $rootScope.$apply('items.a = true');

        expect(element.text()).toBe('A');
      })
    );

    it('should not throw if scope has been destroyed when template request is ready',
      inject(function($rootScope, $httpBackend, $compile) {
        $httpBackend.expectGET('messages.html').respond('<div ng-message="a">A</div>');
        $rootScope.show = true;
        var html =
            '<div ng-if="show">' +
              '<div ng-messages="items">' +
                '<div ng-messages-include="messages.html"></div>' +
              '</div>' +
            '</div>';

        element = $compile(html)($rootScope);
        $rootScope.$digest();
        $rootScope.show = false;
        $rootScope.$digest();
        expect(function() {
          $httpBackend.flush();
        }).not.toThrow();
    }));

    it('should not throw if the template is empty',
      inject(function($compile, $rootScope, $templateCache) {
        var html =
            '<div ng-messages="items">' +
              '<div ng-messages-include="messages1.html"></div>' +
              '<div ng-messages-include="messages2.html"></div>' +
            '</div>';

        $templateCache.put('messages1.html', '');
        $templateCache.put('messages2.html', '   ');
        element = $compile(html)($rootScope);
        $rootScope.$digest();

        expect(element.text()).toBe('');
        expect(element.children().length).toBe(0);
        expect(element.contents().length).toBe(2);
      })
    );
  });

  describe('when multiple', function() {
    they('should show all truthy messages when the $prop attr is present',
      { 'multiple': 'multiple',
        'ng-messages-multiple': 'ng-messages-multiple' },
    function(prop) {
      inject(function($rootScope, $compile) {
        element = $compile('<div ng-messages="data" ' + prop + '>' +
                           '  <div ng-message="one">1</div>' +
                           '  <div ng-message="two">2</div>' +
                           '  <div ng-message="three">3</div>' +
                           '</div>')($rootScope);

        $rootScope.$apply(function() {
          $rootScope.data = {
            'one': true,
            'two': false,
            'three': true
          };
        });

        expect(messageChildren(element).length).toBe(2);
        expect(s(element.text())).toContain('13');
      });
    });

    it('should render all truthy messages from a remote template',
      inject(function($rootScope, $compile, $templateCache) {

      $templateCache.put('xyz.html', '<div ng-message="x">X</div>' +
                                     '<div ng-message="y">Y</div>' +
                                     '<div ng-message="z">Z</div>');

      element = $compile('<div ng-messages="data" ng-messages-multiple="true">' +
                           '<div ng-messages-include="xyz.html"></div>' +
                         '</div>')($rootScope);

      $rootScope.$apply(function() {
        $rootScope.data = {
          'x': 'a',
          'y': null,
          'z': true
        };
      });

      expect(messageChildren(element).length).toBe(2);
      expect(s(element.text())).toEqual('XZ');

      $rootScope.$apply(function() {
        $rootScope.data.y = {};
      });

      expect(messageChildren(element).length).toBe(3);
      expect(s(element.text())).toEqual('XYZ');
    }));

    it('should render and override all truthy messages from a remote template',
      inject(function($rootScope, $compile, $templateCache) {

      $templateCache.put('xyz.html', '<div ng-message="x">X</div>' +
                                     '<div ng-message="y">Y</div>' +
                                     '<div ng-message="z">Z</div>');

      element = $compile('<div ng-messages="data" ng-messages-multiple="true">' +
                            '<div ng-message="y">YYY</div>' +
                            '<div ng-message="z">ZZZ</div>' +
                            '<div ng-messages-include="xyz.html"></div>' +
                         '</div>')($rootScope);

      $rootScope.$apply(function() {
        $rootScope.data = {
          'x': 'a',
          'y': null,
          'z': true
        };
      });

      expect(messageChildren(element).length).toBe(2);
      expect(s(element.text())).toEqual('ZZZX');

      $rootScope.$apply(function() {
        $rootScope.data.y = {};
      });

      expect(messageChildren(element).length).toBe(3);
      expect(s(element.text())).toEqual('YYYZZZX');
    }));
  });
});
'use strict';

describe('angular.scenario.matchers', function() {
  var matchers;

  function expectMatcher(value, test) {
    delete matchers.error;
    delete matchers.future.value;
    if (isDefined(value)) {
      matchers.future.value = value;
    }
    test();
    expect(matchers.error).toBeUndefined();
  }

  beforeEach(function() {
    /**
     * Mock up the future system wrapped around matchers.
     *
     * @see Scenario.js#angular.scenario.matcher
     */
    matchers = {
      future: { name: 'test' }
    };
    matchers.addFuture = function(name, callback) {
      callback(function(error) {
        matchers.error = error;
      });
    };
    angular.extend(matchers, angular.scenario.matcher);
  });

  it('should handle basic matching', function() {
    expectMatcher(10, function() { matchers.toEqual(10); });
    expectMatcher('value', function() { matchers.toBeDefined(); });
    expectMatcher([1], function() { matchers.toBeTruthy(); });
    expectMatcher('', function() { matchers.toBeFalsy(); });
    expectMatcher(0, function() { matchers.toBeFalsy(); });
    expectMatcher('foo', function() { matchers.toMatch('.o.'); });
    expectMatcher(null, function() { matchers.toBeNull(); });
    expectMatcher([1, 2, 3], function() { matchers.toContain(2); });
    expectMatcher(3, function() { matchers.toBeLessThan(10); });
    expectMatcher(3, function() { matchers.toBeGreaterThan(-5); });
  });

  it('should have toHaveClass matcher', function() {
    var e = angular.element('<div class="abc">');
    expect(e).not.toHaveClass('none');
    expect(e).toHaveClass('abc');
  });
});
'use strict';

/**
 * Mock Application
 */
function ApplicationMock($window) {
  this.$window = $window;
}
ApplicationMock.prototype = {
  executeAction: function(callback) {
    callback.call(this.$window, _jQuery(this.$window.document), this.$window);
  }
};

describe('angular.scenario.SpecRunner', function() {
  var $window, $root, log;
  var runner;

  function createSpec(name, body) {
    return {
      name: name,
      before: angular.noop,
      body: body || angular.noop,
      after: angular.noop
    };
  }

  beforeEach(inject(function($rootScope) {
    log = [];
    $window = {};
    $window.setTimeout = function(fn, timeout) {
      fn();
    };
    $root = $rootScope;
    $root.emit = function(eventName) {
      log.push(eventName);
    };
    $root.on = function(eventName) {
      log.push('Listener Added for ' + eventName);
    };
    $root.application = new ApplicationMock($window);
    $root.$window = $window;
    runner = $root.$new();

    var Cls = angular.scenario.SpecRunner;
    for (var name in Cls.prototype) {
      runner[name] = angular.bind(runner, Cls.prototype[name]);
    }

    Cls.call(runner);
  }));

  it('should bind futures to the spec', function() {
    runner.addFuture('test future', function(done) {
      this.value = 10;
      done();
    });
    runner.futures[0].execute(angular.noop);
    expect(runner.value).toEqual(10);
  });

  it('should pass done to future action behavior', function() {
    runner.addFutureAction('test future', function($window, $document, done) {
      expect(angular.isFunction(done)).toBeTruthy();
      done(10, 20);
    });
    runner.futures[0].execute(function(error, result) {
      expect(error).toEqual(10);
      expect(result).toEqual(20);
    });
  });

  it('should execute spec function and notify UI', function() {
    var finished;
    var spec = createSpec('test spec', function() {
      this.test = 'some value';
    });
    runner.addFuture('test future', function(done) {
      done();
    });
    runner.run(spec, function() {
      finished = true;
    });
    expect(runner.test).toEqual('some value');
    expect(finished).toBeTruthy();
    expect(log).toEqual([
      'SpecBegin',
      'StepBegin',
      'StepEnd',
      'SpecEnd'
    ]);
  });

  it('should execute notify UI on spec setup error', function() {
    var finished;
    var spec = createSpec('test spec', function() {
      throw new Error('message');
    });
    runner.run(spec, function() {
      finished = true;
    });
    expect(finished).toBeTruthy();
    expect(log).toEqual([
      'SpecBegin',
      'SpecError',
      'SpecEnd'
    ]);
  });

  it('should execute notify UI on step failure', function() {
    var finished;
    var spec = createSpec('test spec');
    runner.addFuture('test future', function(done) {
      done('failure message');
    });
    runner.run(spec, function() {
      finished = true;
    });
    expect(finished).toBeTruthy();
    expect(log).toEqual([
      'SpecBegin',
      'StepBegin',
      'StepFailure',
      'StepEnd',
      'SpecEnd'
    ]);
  });

  it('should execute notify UI on step error', function() {
    var finished;
    var spec = createSpec('test spec', function() {
      this.addFuture('test future', function(done) {
        throw new Error('error message');
      });
    });
    runner.run(spec, function() {
      finished = true;
    });
    expect(finished).toBeTruthy();
    expect(log).toEqual([
      'SpecBegin',
      'StepBegin',
      'StepError',
      'StepEnd',
      'SpecEnd'
    ]);
  });

  it('should run after handlers even if error in body of spec', function() {
    var finished, after;
    var spec = createSpec('test spec', function() {
      this.addFuture('body', function(done) {
        throw new Error('error message');
      });
    });
    spec.after = function() {
      this.addFuture('after', function(done) {
        after = true;
        done();
      });
    };
    runner.run(spec, function() {
      finished = true;
    });
    expect(finished).toBeTruthy();
    expect(after).toBeTruthy();
    expect(log).toEqual([
      'SpecBegin',
      'StepBegin',
      'StepError',
      'StepEnd',
      'StepBegin',
      'StepEnd',
      'SpecEnd'
    ]);
  });
});
'use strict';

angular.scenario.testing = angular.scenario.testing || {};

angular.scenario.testing.MockAngular = function() {
  this.reset();
  this.element = jqLite;
};

angular.scenario.testing.MockAngular.prototype.reset = function() {
  this.log = [];
};

angular.scenario.testing.MockAngular.prototype.poll = function() {
  this.log.push('$browser.poll()');
  return this;
};

angular.scenario.testing.MockRunner = function() {
  this.listeners = [];
};

angular.scenario.testing.MockRunner.prototype.on = function(eventName, fn) {
  this.listeners[eventName] = this.listeners[eventName] || [];
  this.listeners[eventName].push(fn);
};

angular.scenario.testing.MockRunner.prototype.emit = function(eventName) {
  var args = Array.prototype.slice.call(arguments, 1);
  angular.forEach(this.listeners[eventName] || [], function(fn) {
    fn.apply(this, args);
  });
};
'use strict';

describe('angular.scenario.Future', function() {
  var future;

  it('should set the sane defaults', function() {
    var behavior = function() {};
    var future = new angular.scenario.Future('test name', behavior, 'foo');
    expect(future.name).toEqual('test name');
    expect(future.behavior).toEqual(behavior);
    expect(future.line).toEqual('foo');
    expect(future.value).toBeUndefined();
    expect(future.fulfilled).toBeFalsy();
    expect(future.parser).toEqual(angular.identity);
  });

  it('should be fulfilled after execution and done callback', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done();
    });
    future.execute(angular.noop);
    expect(future.fulfilled).toBeTruthy();
  });

  it('should take callback with (error, result) and forward', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done(10, 20);
    });
    future.execute(function(error, result) {
      expect(error).toEqual(10);
      expect(result).toEqual(20);
    });
  });

  it('should use error as value if provided', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done(10, 20);
    });
    future.execute(angular.noop);
    expect(future.value).toEqual(10);
  });

  it('should parse json with fromJson', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done(null, '{"test": "foo"}');
    });
    future.fromJson().execute(angular.noop);
    expect(future.value).toEqual({test: 'foo'});
  });

  it('should convert to json with toJson', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done(null, {test: 'foo'});
    });
    future.toJson().execute(angular.noop);
    expect(future.value).toEqual('{"test":"foo"}');
  });

  it('should convert with custom parser', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done(null, 'foo');
    });
    future.parsedWith(function(value) {
      return value.toUpperCase();
    }).execute(angular.noop);
    expect(future.value).toEqual('FOO');
  });

  it('should pass error if parser fails', function() {
    var future = new angular.scenario.Future('test name', function(done) {
      done(null, '{');
    });
    future.fromJson().execute(function(error, result) {
      expect(error).toBeDefined();
    });
  });
});
'use strict';

describe('angular.scenario.Describe', function() {
  var log;
  var root;

  beforeEach(function() {
    root = new angular.scenario.Describe();

    /**
     * Simple callback logging system. Use to assert proper order of calls.
     */
    log = function(text) {
      log.text = log.text + text;
    };
    log.fn = function(text) {
      return function(done) {
        log(text);
        (done || angular.noop)();
      };
    };
    log.reset = function() {
      log.text = '';
    };
    log.reset();
  });

  it('should handle basic nested case', function() {
    root.describe('A', function() {
      this.beforeEach(log.fn('{'));
      this.afterEach(log.fn('}'));
      this.it('1', log.fn('1'));
      this.describe('B', function() {
        this.beforeEach(log.fn('('));
        this.afterEach(log.fn(')'));
        this.it('2', log.fn('2'));
      });
    });
    var specs = root.getSpecs();
    expect(specs.length).toEqual(2);

    expect(specs[0].name).toEqual('2');
    specs[0].before();
    specs[0].body();
    specs[0].after();
    expect(log.text).toEqual('{(2)}');

    log.reset();
    expect(specs[1].name).toEqual('1');
    specs[1].before();
    specs[1].body();
    specs[1].after();
    expect(log.text).toEqual('{1}');
  });

  it('should link nested describe blocks with parent and children', function() {
    root.describe('A', function() {
      this.it('1', angular.noop);
      this.describe('B', function() {
        this.it('2', angular.noop);
        this.describe('C', function() {
          this.it('3', angular.noop);
        });
      });
    });
    var specs = root.getSpecs();
    expect(specs[2].definition.parent).toEqual(root);
    expect(specs[0].definition.parent).toEqual(specs[2].definition.children[0]);
  });

  it('should not process xit and xdescribe', function() {
    root.describe('A', function() {
      this.xit('1', angular.noop);
      this.xdescribe('B', function() {
        this.it('2', angular.noop);
        this.describe('C', function() {
          this.it('3', angular.noop);
        });
      });
    });
    var specs = root.getSpecs();
    expect(specs.length).toEqual(0);
  });


  it('should only return iit and ddescribe if present', function() {
    root.describe('A', function() {
      this.it('1', angular.noop);
      this.iit('2', angular.noop);
      this.describe('B', function() {
        this.it('3', angular.noop);
        this.ddescribe('C', function() {
          this.it('4', angular.noop);
          this.describe('D', function() {
            this.it('5', angular.noop);
          });
        });
      });
    });
    var specs = root.getSpecs();
    expect(specs.length).toEqual(3);
    expect(specs[0].name).toEqual('5');
    expect(specs[1].name).toEqual('4');
    expect(specs[2].name).toEqual('2');
  });

  it('should create uniqueIds in the tree', function() {
    angular.scenario.Describe.id = 0;
    var a = new angular.scenario.Describe();
    var b = new angular.scenario.Describe();
    expect(a.id).not.toEqual(b.id);
  });

  it('should create uniqueIds for each spec', function() {
    var d = new angular.scenario.Describe();
    d.it('fake', function() {});
    d.it('fake', function() {});

    expect(d.its[0].id).toBeDefined();
    expect(d.its[1].id).toBeDefined();
    expect(d.its[0].id).not.toEqual(d.its[1].id);
  });
});
'use strict';

describe('ScenarioSpec: Compilation', function() {
  var element;

  afterEach(function() {
    dealoc(element);
  });


  describe('compilation', function() {
    it('should compile dom node and return scope', inject(function($rootScope, $compile) {
      var node = jqLite('<div ng-init="a=1">{{b=a+1}}</div>')[0];
      element = $compile(node)($rootScope);
      $rootScope.$digest();
      expect($rootScope.a).toEqual(1);
      expect($rootScope.b).toEqual(2);
    }));

    it('should compile jQuery node and return scope', inject(function($rootScope, $compile) {
      element = $compile(jqLite('<div>{{a=123}}</div>'))($rootScope);
      $rootScope.$digest();
      expect(jqLite(element).text()).toEqual('123');
    }));

    it('should compile text node and return scope', inject(function($rootScope, $compile) {
      element = $compile('<div>{{a=123}}</div>')($rootScope);
      $rootScope.$digest();
      expect(jqLite(element).text()).toEqual('123');
    }));
  });

  describe('jQuery', function() {
    it('should exist on the angular.scenario object', function() {
      expect(angular.scenario.jQuery).toBeDefined();
    });

    it('should have common jQuery methods', function() {
      var jQuery = angular.scenario.jQuery;
      expect(typeof jQuery).toEqual('function');
      expect(typeof jQuery('<div></div>').html).toEqual('function');
    });
  });
});
'use strict';

describe('angular.scenario.dsl', function() {
  var element;
  var $window, $root;
  var eventLog;

  afterEach(function() {
    dealoc(element);
  });

  beforeEach(module('ngSanitize'));

  beforeEach(inject(function($injector) {
    eventLog = [];
    $window = {
      document: window.document.body,
      angular: new angular.scenario.testing.MockAngular()
    };
    jqLite($window.document).data('$injector', $injector).attr('ng-app', '').addClass('html');
    $root = $injector.get('$rootScope');
    $root.emit = function(eventName) {
      eventLog.push(eventName);
    };
    $root.on = function(eventName) {
      eventLog.push('Listener Added for ' + eventName);
    };
    $root.futures = [];
    $root.futureLog = [];
    $root.$window = $window;
    $root.addFuture = function(name, fn) {
      this.futures.push(name);
      fn.call(this, function(error, result) {
        $root.futureError = error;
        $root.futureResult = result;
        $root.futureLog.push(name);
      });
    };
    $root.dsl = {};
    angular.forEach(angular.scenario.dsl, function(fn, name) {
      $root.dsl[name] = function() {
        return fn.call($root).apply($root, arguments);
      };
    });
    $root.application = new angular.scenario.Application(jqLite($window.document));
    $root.application.getWindow_ = function() {
      return $window;
    };
    $root.application.navigateTo = function(url, callback) {
      $window.location = url;
      callback();
    };
    // Just use the real one since it delegates to this.addFuture
    $root.addFutureAction = angular.scenario.
      SpecRunner.prototype.addFutureAction;
    jqLite($window.document).empty();
  }));

  afterEach(function() {
    jqLite($window.document).removeData('$injector');
  });

  describe('Pause', function() {
    it('should pause until resume to complete', function() {
      expect($window.resume).toBeUndefined();
      $root.dsl.pause();
      expect(angular.isFunction($window.resume)).toBeTruthy();
      expect($root.futureLog).toEqual([]);
      $window.resume();
      expect($root.futureLog).
        toEqual(['pausing for you to resume']);
      expect(eventLog).toContain('InteractivePause');
    });
  });

  describe('Sleep', function() {
    beforeEach(function() {
      $root.$window.setTimeout = function(fn, value) {
        $root.timerValue = value;
        fn();
      };
    });

    it('should sleep for specified seconds', function() {
      $root.dsl.sleep(10);
      expect($root.timerValue).toEqual(10000);
      expect($root.futureResult).toEqual(10000);
    });
  });

  describe('Expect', function() {
    it('should chain and execute matcher', function() {
      var future = {value: 10};
      var result = $root.dsl.expect(future);
      result.toEqual(10);
      expect($root.futureError).toBeUndefined();
      expect($root.futureResult).toBeUndefined();
      result = $root.dsl.expect(future);
      result.toEqual(20);
      expect($root.futureError).toBeDefined();
    });
  });

  describe('Browser', function() {
    describe('Reload', function() {
      it('should navigateTo', function() {
        $window.location = {
          href: '#foo'
        };
        $root.dsl.browser().reload();
        expect($root.futureResult).toEqual('#foo');
        expect($window.location).toEqual('#foo');
      });
    });

    describe('NavigateTo', function() {
      it('should allow a string url', function() {
        $root.dsl.browser().navigateTo('http://myurl');
        expect($window.location).toEqual('http://myurl');
        expect($root.futureResult).toEqual('http://myurl');
      });

      it('should allow a future url', function() {
        $root.dsl.browser().navigateTo('http://myurl', function() {
          return 'http://futureUrl/';
        });
        expect($window.location).toEqual('http://futureUrl/');
        expect($root.futureResult).toEqual('http://futureUrl/');
      });

      it('should complete if AngularJS is missing from app frame', function() {
        delete $window.angular;
        $root.dsl.browser().navigateTo('http://myurl');
        expect($window.location).toEqual('http://myurl');
        expect($root.futureResult).toEqual('http://myurl');
      });
    });

    describe('window', function() {
      beforeEach(function() {
        $window.location = {
          href: 'http://myurl/some/path?foo=10#/bar?x=2',
          pathname: '/some/path',
          search: '?foo=10',
          hash: '#bar?x=2'
        };
      });

      it('should return full URL for href', function() {
        $root.dsl.browser().window().href();
        expect($root.futureResult).toEqual($window.location.href);
      });

      it('should return the pathname', function() {
        $root.dsl.browser().window().path();
        expect($root.futureResult).toEqual($window.location.pathname);
      });

      it('should return the search part', function() {
        $root.dsl.browser().window().search();
        expect($root.futureResult).toEqual($window.location.search);
      });

      it('should return the hash without the #', function() {
        $root.dsl.browser().window().hash();
        expect($root.futureResult).toEqual('bar?x=2');
      });
    });

    describe('location', function() {
      beforeEach(inject(function($injector) {
        angular.extend($injector.get('$location'), {
          url: function() {return '/path?search=a#hhh';},
          path: function() {return '/path';},
          search: function() {return {search: 'a'};},
          hash: function() {return 'hhh';}
        });
      }));

      it('should return full url', function() {
        $root.dsl.browser().location().url();
        expect($root.futureResult).toEqual('/path?search=a#hhh');
      });

      it('should return the pathname', function() {
        $root.dsl.browser().location().path();
        expect($root.futureResult).toEqual('/path');
      });

      it('should return the query string as an object', function() {
        $root.dsl.browser().location().search();
        expect($root.futureResult).toEqual({search: 'a'});
      });

      it('should return the hash without the #', function() {
        $root.dsl.browser().location().hash();
        expect($root.futureResult).toEqual('hhh');
      });
    });
  });

  describe('Element Finding', function() {
    var doc;
    beforeEach(inject(function($injector) {
      doc = _jQuery($window.document).append('<div class="body"></div>').find('.body');
    }));

    describe('Select', function() {
      it('should select single option', function() {
        doc.append(
          '<select ng-model="test">' +
          '  <option value=A>one</option>' +
          '  <option value=B selected>two</option>' +
          '</select>'
        );
        $root.dsl.select('test').option('A');
        expect(doc.find('[ng-model="test"]').val()).toEqual('A');
      });

      it('should select single option using data-ng', function() {
        doc.append(
          '<select data-ng-model="test">' +
          '  <option value=A>one</option>' +
          '  <option value=B selected>two</option>' +
          '</select>'
        );
        $root.dsl.select('test').option('A');
        expect(doc.find('[data-ng-model="test"]').val()).toEqual('A');
      });

      it('should select single option using x-ng', function() {
        doc.append(
          '<select x-ng-model="test">' +
          '  <option value=A>one</option>' +
          '  <option value=B selected>two</option>' +
          '</select>'
        );
        $root.dsl.select('test').option('A');
        expect(doc.find('[x-ng-model="test"]').val()).toEqual('A');
      });

      it('should select option by exact name', function() {
        doc.append(
            '<select ng-model="test">' +
            '  <option value=A>twenty one</option>' +
            '  <option value=B selected>two</option>' +
            '  <option value=C>thirty one</option>' +
            '  <option value=D>one</option>' +
            '</select>'
          );
        $root.dsl.select('test').option('one');
        expect(doc.find('[ng-model="test"]').val()).toEqual('D');
      });

      it('should select option by name if no exact match and name contains value', function() {
        doc.append(
            '<select ng-model="test">' +
            '  <option value=A>twenty one</option>' +
            '  <option value=B selected>two</option>' +
            '  <option value=C>thirty one</option>' +
            '</select>'
          );
        $root.dsl.select('test').option('one');
        expect(doc.find('[ng-model="test"]').val()).toEqual('A');
      });

      it('should select multiple options', function() {
        doc.append(
          '<select ng-model="test" multiple>' +
          '  <option>A</option>' +
          '  <option selected>B</option>' +
          '  <option>C</option>' +
          '</select>'
        );
        $root.dsl.select('test').options('A', 'B');
        expect(doc.find('[ng-model="test"]').val()).toEqual(['A','B']);
      });

      it('should fail to select multiple options on non-multiple select', function() {
        doc.append('<select ng-model="test"></select>');
        $root.dsl.select('test').options('A', 'B');
        expect($root.futureError).toMatch(/did not match/);
      });

      it('should fail to select an option that does not exist', function() {
        doc.append(
            '<select ng-model="test">' +
            '  <option value=A>one</option>' +
            '  <option value=B selected>two</option>' +
            '</select>'
          );
        $root.dsl.select('test').option('three');
        expect($root.futureError).toMatch(/not found/);
      });
    });

    describe('Element', function() {
      it('should execute click', function() {
        var clicked;
        // Hash is important, otherwise we actually
        // go to a different page and break the runner
        doc.append('<a href="#"></a>');
        doc.find('a').click(function() {
          clicked = true;
        });
        $root.dsl.element('a').click();
      });

      it('should navigate page if click on anchor', function() {
        expect($window.location).not.toEqual('#foo');
        doc.append('<a href="#foo"></a>');
        $root.dsl.element('a').click();
        expect($window.location).toMatch(/#foo$/);
      });

      it('should not navigate if click event was cancelled', function() {
        var initLocation = $window.location,
            elm = jqLite('<a href="#foo"></a>');

        doc.append(elm);
        elm.on('click', function(event) {
          event.preventDefault();
        });

        $root.dsl.element('a').click();
        expect($window.location).toBe(initLocation);
        dealoc(elm);
      });

      it('should execute dblclick', function() {
        var clicked;
        // Hash is important, otherwise we actually
        // go to a different page and break the runner
        doc.append('<a href="#"></a>');
        doc.find('a').dblclick(function() {
          clicked = true;
        });
        $root.dsl.element('a').dblclick();
      });

      it('should navigate page if dblclick on anchor', function() {
        expect($window.location).not.toEqual('#foo');
        doc.append('<a href="#foo"></a>');
        $root.dsl.element('a').dblclick();
        expect($window.location).toMatch(/#foo$/);
      });

      it('should not navigate if dblclick event was cancelled', function() {
        var initLocation = $window.location,
            elm = jqLite('<a href="#foo"></a>');

        doc.append(elm);
        elm.on('dblclick', function(event) {
          event.preventDefault();
        });

        $root.dsl.element('a').dblclick();
        expect($window.location).toBe(initLocation);
        dealoc(elm);
      });

      it('should execute mouseover', function() {
        var mousedOver;
        doc.append('<div></div>');
        doc.find('div').mouseover(function() {
          mousedOver = true;
        });
        $root.dsl.element('div').mouseover();
        expect(mousedOver).toBe(true);
      });

      it('should bubble up the mouseover event', function() {
        var mousedOver;
        doc.append('<div id="outer"><div id="inner"></div></div>');
        doc.find('#outer').mouseover(function() {
          mousedOver = true;
        });
        $root.dsl.element('#inner').mouseover();
        expect(mousedOver).toBe(true);
      });

      it('should execute mousedown', function() {
        var mousedDown;
        doc.append('<div></div>');
        doc.find('div').mousedown(function() {
          mousedDown = true;
        });
        $root.dsl.element('div').mousedown();
        expect(mousedDown).toBe(true);
      });

      it('should bubble up the mousedown event', function() {
        var mousedDown;
        doc.append('<div id="outer"><div id="inner"></div></div>');
        doc.find('#outer').mousedown(function() {
          mousedDown = true;
        });
        $root.dsl.element('#inner').mousedown();
        expect(mousedDown).toBe(true);
      });

      it('should execute mouseup', function() {
        var mousedUp;
        doc.append('<div></div>');
        doc.find('div').mouseup(function() {
          mousedUp = true;
        });
        $root.dsl.element('div').mouseup();
        expect(mousedUp).toBe(true);
      });

      it('should bubble up the mouseup event', function() {
        var mousedUp;
        doc.append('<div id="outer"><div id="inner"></div></div>');
        doc.find('#outer').mouseup(function() {
          mousedUp = true;
        });
        $root.dsl.element('#inner').mouseup();
        expect(mousedUp).toBe(true);
      });

      it('should count matching elements', function() {
        doc.append('<span></span><span></span>');
        $root.dsl.element('span').count();
        expect($root.futureResult).toEqual(2);
      });

      it('should return count of 0 if no matching elements', function() {
        $root.dsl.element('span').count();
        expect($root.futureResult).toEqual(0);
      });

      it('should get attribute', function() {
        doc.append('<div id="test" class="foo"></div>');
        $root.dsl.element('#test').attr('class');
        expect($root.futureResult).toEqual('foo');
      });

      it('should set attribute', function() {
        doc.append('<div id="test" class="foo"></div>');
        $root.dsl.element('#test').attr('class', 'bam');
        expect(doc.find('#test').attr('class')).toEqual('bam');
      });

      it('should get property', function() {
        doc.append('<div id="test" class="foo"></div>');
        $root.dsl.element('#test').prop('className');
        expect($root.futureResult).toEqual('foo');
      });

      it('should set property', function() {
        doc.append('<div id="test" class="foo"></div>');
        $root.dsl.element('#test').prop('className', 'bam');
        expect(doc.find('#test').prop('className')).toEqual('bam');
      });

      it('should get css', function() {
        doc.append('<div id="test" style="height: 30px"></div>');
        $root.dsl.element('#test').css('height');
        expect($root.futureResult).toMatch(/30px/);
      });

      it('should set css', function() {
        doc.append('<div id="test" style="height: 10px"></div>');
        $root.dsl.element('#test').css('height', '20px');
        expect(doc.find('#test').css('height')).toEqual('20px');
      });

      it('should add all jQuery key/value methods', function() {
        var METHODS = ['css', 'attr'];
        var chain = $root.dsl.element('input');
        angular.forEach(METHODS, function(name) {
          expect(angular.isFunction(chain[name])).toBeTruthy();
        });
      });

      it('should get val', function() {
        doc.append('<input value="bar">');
        $root.dsl.element('input').val();
        expect($root.futureResult).toEqual('bar');
      });

      it('should set val', function() {
        doc.append('<input value="bar">');
        $root.dsl.element('input').val('baz');
        expect(doc.find('input').val()).toEqual('baz');
      });

      it('should use correct future name for generated set methods', function() {
        doc.append('<input value="bar">');
        $root.dsl.element('input').val(false);
        expect($root.futures.pop()).toMatch(/element 'input' set val/);
      });

      it('should use correct future name for generated get methods', function() {
        doc.append('<input value="bar">');
        $root.dsl.element('input').val();
        expect($root.futures.pop()).toMatch(/element 'input' val/);
      });

      it('should add all jQuery property methods', function() {
        var METHODS = [
          'val', 'text', 'html', 'height', 'innerHeight', 'outerHeight', 'width',
          'innerWidth', 'outerWidth', 'position', 'scrollLeft', 'scrollTop', 'offset'
        ];
        var chain = $root.dsl.element('input');
        angular.forEach(METHODS, function(name) {
          expect(angular.isFunction(chain[name])).toBeTruthy();
        });
      });

      it('should execute custom query', function() {
        doc.append('<a id="test" href="http://example.com/myUrl"></a>');
        $root.dsl.element('#test').query(function(elements, done) {
          done(null, elements.attr('href'));
        });
        expect($root.futureResult).toEqual('http://example.com/myUrl');
      });

      it('should use the selector as label if none is given', function() {
        $root.dsl.element('mySelector');
        expect($root.label).toEqual('mySelector');
      });

      it('should include the selector in paren when a label is given', function() {
        $root.dsl.element('mySelector', 'myLabel');
        expect($root.label).toEqual('myLabel ( mySelector )');
      });
    });

    describe('Repeater', function() {
      var chain;
      beforeEach(inject(function($compile, $rootScope) {
        element = $compile(
          '<ul><li ng-repeat="i in items">{{i.name}}  {{i.gender}}</li></ul>')($rootScope);
        $rootScope.items = [{name:'misko', gender:'male'}, {name:'felisa', gender:'female'}];
        $rootScope.$apply();
        doc.append(element);
        chain = $root.dsl.repeater('ul li');
      }));

      it('should get the row count', function() {
        chain.count();
        expect($root.futureResult).toEqual(2);
      });

      it('should return 0 if repeater doesnt match', inject(function($rootScope) {
        $rootScope.items = [];
        $rootScope.$apply();
        chain.count();
        expect($root.futureResult).toEqual(0);
      }));

      it('should get a row of bindings', function() {
        chain.row(1);
        expect($root.futureResult).toEqual(['felisa', 'female']);
      });

      it('should get a column of bindings', function() {
        chain.column('i.gender');
        expect($root.futureResult).toEqual(['male', 'female']);
      });

      it('should use the selector as label if none is given', function() {
        expect($root.label).toEqual('ul li');
      });

      it('should include the selector in paren when a label is given', function() {
        $root.dsl.repeater('mySelector', 'myLabel');
        expect($root.label).toEqual('myLabel ( ul li mySelector )');
      });
    });

    describe('Binding', function() {
      var compile;

      beforeEach(inject(function($compile, $rootScope) {
        compile = function(html, value) {
          element = $compile(html)($rootScope);
          doc.append(element);
          $rootScope.foo = {bar: value || 'some value'};
          $rootScope.$apply();
        };
      }));


      it('should select binding in interpolation', function() {
        compile('<span>{{ foo.bar }}</span>');
        $root.dsl.binding('foo.bar');
        expect($root.futureResult).toEqual('some value');
      });

      it('should select binding in multiple interpolations', function() {
        compile('<span>{{ foo.bar }}<hr/> {{ true }}</span>');
        $root.dsl.binding('foo.bar');
        expect($root.futureResult).toEqual('some value');

        $root.dsl.binding('true');
        expect($root.futureResult).toEqual('true');
      });

      it('should select binding by name', function() {
        compile('<span ng-bind=" foo.bar "></span>');
        $root.dsl.binding('foo.bar');
        expect($root.futureResult).toEqual('some value');
      });

      it('should select binding by regexp', function() {
        compile('<span ng-bind="foo.bar">some value</span>');
        $root.dsl.binding(/^foo\..+/);
        expect($root.futureResult).toEqual('some value');
      });

      it('should return innerHTML for all the other elements', function() {
        compile('<div ng-bind-html="foo.bar"></div>', 'some <b>value</b>');
        $root.dsl.binding('foo.bar');
        expect($root.futureResult.toLowerCase()).toEqual('some <b>value</b>');
      });

      it('should select binding in template by name', function() {
        compile('<pre ng-bind-template="foo {{foo.bar}} baz"></pre>', 'bar');
        $root.dsl.binding('foo.bar');
        expect($root.futureResult).toEqual('bar');
      });

      it('should match bindings by substring match', function() {
        compile('<pre ng-bind="foo.bar | lowercase"></pre>', 'binding value');
        $root.dsl.binding('foo . bar');
        expect($root.futureResult).toEqual('binding value');
      });

      it('should return error if no bindings in document', function() {
        $root.dsl.binding('foo.bar');
        expect($root.futureError).toMatch(/did not match/);
      });

      it('should return error if no binding matches', function() {
        compile('<span ng-bind="foo">some value</span>');
        $root.dsl.binding('foo.bar');
        expect($root.futureError).toMatch(/did not match/);
      });
    });

    describe('Using', function() {
      it('should prefix selector in $document.elements()', function() {
        var chain;
        doc.append(
          '<div id="test1"><input ng-model="test.input" value="something"></div>' +
          '<div id="test2"><input ng-model="test.input" value="something"></div>'
        );
        chain = $root.dsl.using('div#test2');
        chain.input('test.input').enter('foo');
        var inputs = _jQuery('input[ng-model="test.input"]');
        expect(inputs.first().val()).toEqual('something');
        expect(inputs.last().val()).toEqual('foo');
      });

      it('should use the selector as label if none is given', function() {
        $root.dsl.using('mySelector');
        expect($root.label).toEqual('mySelector');
      });

      it('should include the selector in paren when a label is given', function() {
        $root.dsl.using('mySelector', 'myLabel');
        expect($root.label).toEqual('myLabel ( mySelector )');
      });

    });

    describe('Input', function() {
      it('should change value in text input', function(done) {
        inject(function($compile) {
          var job = createAsync(done);
          job
          .runs(function() {
            element = $compile('<input ng-model="test.input" value="something">')($root);
            doc.append(element);
            var chain = $root.dsl.input('test.input');
            chain.enter('foo');
            expect(_jQuery('input[ng-model="test.input"]').val()).toEqual('foo');
          })
          // cleanup the event queue
          .waits(0)
          .runs(function() {
            expect($root.test.input).toBe('foo');
          })
          .done();
          job.start();
        });
      });

      it('should change value in text input in dash form', function() {
        doc.append('<input ng-model="test.input" value="something">');
        var chain = $root.dsl.input('test.input');
        chain.enter('foo');
        expect(_jQuery('input[ng-model="test.input"]').val()).toEqual('foo');
      });
      it('should change value in text input in data-ng form', function() {
        doc.append('<input data-ng-model="test.input" value="something">');
        var chain = $root.dsl.input('test.input');
        chain.enter('foo');
        expect(_jQuery('input[data-ng-model="test.input"]').val()).toEqual('foo');
      });
      it('should change value in text input in x-ng form', function() {
        doc.append('<input x-ng-model="test.input" value="something">');
        var chain = $root.dsl.input('test.input');
        chain.enter('foo');
        expect(_jQuery('input[x-ng-model="test.input"]').val()).toEqual('foo');
      });



      it('should return error if no input exists', function() {
        var chain = $root.dsl.input('test.input');
        chain.enter('foo');
        expect($root.futureError).toMatch(/did not match/);
      });

      it('should toggle checkbox state', function() {
        doc.append('<input type="checkbox" ng-model="test.input" checked>');
        expect(_jQuery('input[ng-model="test.input"]').
          prop('checked')).toBe(true);
        var chain = $root.dsl.input('test.input');
        chain.check();
        expect(_jQuery('input[ng-model="test.input"]').
          prop('checked')).toBe(false);
        $window.angular.reset();
        chain.check();
        expect(_jQuery('input[ng-model="test.input"]').
          prop('checked')).toBe(true);
      });

      it('should return error if checkbox did not match', function() {
        var chain = $root.dsl.input('test.input');
        chain.check();
        expect($root.futureError).toMatch(/did not match/);
      });

      it('should select option from radio group', function() {
        doc.append(
          '<input type="radio" name="r" ng:model="test.input" value="foo">' +
          '<input type="radio" name="r" ng:model="test.input" value="bar" checked="checked">'
        );
        // HACK! We don't know why this is sometimes false on chrome
        _jQuery('input[ng\\:model="test.input"][value="bar"]').prop('checked', true);
        expect(_jQuery('input[ng\\:model="test.input"][value="bar"]').
          prop('checked')).toBe(true);
        expect(_jQuery('input[ng\\:model="test.input"][value="foo"]').
          prop('checked')).toBe(false);
        var chain = $root.dsl.input('test.input');
        chain.select('foo');
        expect(_jQuery('input[ng\\:model="test.input"][value="bar"]').
          prop('checked')).toBe(false);
        expect(_jQuery('input[ng\\:model="test.input"][value="foo"]').
          prop('checked')).toBe(true);
      });

      it('should return error if radio button did not match', function() {
        var chain = $root.dsl.input('test.input');
        chain.select('foo');
        expect($root.futureError).toMatch(/did not match/);
      });

      describe('val', function() {
        it('should return value in text input', function() {
          doc.append('<input ng-model="test.input" value="something">');
          $root.dsl.input('test.input').val();
          expect($root.futureResult).toEqual('something');
        });
      });
    });

    describe('Textarea', function() {

      it('should change value in textarea', function() {
        doc.append('<textarea ng-model="test.textarea">something</textarea>');
        var chain = $root.dsl.input('test.textarea');
        chain.enter('foo');
        expect(_jQuery('textarea[ng-model="test.textarea"]').val()).toEqual('foo');
      });

      it('should return error if no textarea exists', function() {
        var chain = $root.dsl.input('test.textarea');
        chain.enter('foo');
        expect($root.futureError).toMatch(/did not match/);
      });
    });
  });
});
'use strict';

describe('angular.scenario.output.json', function() {
  var output, context;
  var runner, model, $window;
  var spec, step;

  beforeEach(function() {
    $window = {};
    context = _jQuery('<div></div>');
    runner = new angular.scenario.testing.MockRunner();
    model = new angular.scenario.ObjectModel(runner);
    output = angular.scenario.output.json(context, runner, model);
    spec = {
      name: 'test spec',
      definition: {
        id: 10,
        name: 'describe'
      }
    };
    step = {
      name: 'some step',
      line: function() { return 'unknown:-1'; }
    };
  });

  it('should put json in context on RunnerEnd', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);
    runner.emit('RunnerEnd');

    expect(angular.fromJson(context.html()).children['describe']
      .specs['test spec'].status).toEqual('success');
  });
});
'use strict';

describe('angular.scenario.output.html', function() {
  var runner, model, spec, step, listeners, ui, context;

  beforeEach(function() {
    listeners = [];
    spec = {
      name: 'test spec',
      definition: {
        id: 10,
        name: 'child',
        children: [],
        parent: {
          id: 20,
          name: 'parent',
          children: []
        }
      }
    };
    step = {
      name: 'some step',
      line: function() { return 'unknown:-1'; }
    };
    runner = new angular.scenario.testing.MockRunner();
    model = new angular.scenario.ObjectModel(runner);
    context = _jQuery('<div></div>');
    ui = angular.scenario.output.html(context, runner, model);
  });

  it('should create nested describe context', function() {
    runner.emit('SpecBegin', spec);
    expect(context.find('#describe-20 #describe-10 > h2').text()).
      toEqual('describe: child');
    expect(context.find('#describe-20 > h2').text()).toEqual('describe: parent');
    expect(context.find('#describe-10 .tests > li .test-info .test-name').text()).
      toEqual('test spec');
    expect(context.find('#describe-10 .tests > li').hasClass('status-pending')).
      toBeTruthy();
  });

  it('should add link on InteractivePause', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('StepBegin', spec, step);
    runner.emit('InteractivePause', spec, step);
    expect(context.find('.test-actions .test-title:first').text()).toEqual('some step');
    expect(lowercase(context.find('.test-actions .test-title:last').html())).toEqual(
      'paused... <a href="javascript:resume()">resume</a> when ready.'
    );
  });

  it('should update totals when steps complete', function() {
    // Failure
    for (var i = 0; i < 3; ++i) {
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepFailure', spec, step, 'error');
      runner.emit('StepEnd', spec, step);
      runner.emit('SpecEnd', spec);
    }

    // Error
    runner.emit('SpecBegin', spec);
    runner.emit('SpecError', spec, 'error');
    runner.emit('SpecEnd', spec);

    // Error
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepError', spec, step, 'error');
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    // Success
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    expect(parseInt(context.find('#status-legend .status-failure').text(), 10)).
      toEqual(3);
    expect(parseInt(context.find('#status-legend .status-error').text(), 10)).
      toEqual(2);
    expect(parseInt(context.find('#status-legend .status-success').text(), 10)).
      toEqual(1);
  });

  it('should update timer when test completes', function() {
    // Success
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    // Failure
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepFailure', spec, step, 'error');
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    // Error
    runner.emit('SpecBegin', spec);
    runner.emit('SpecError', spec, 'error');
    runner.emit('SpecEnd', spec);

    context.find('#describe-10 .tests > li .test-info .timer-result').
      each(function(index, timer) {
        expect(timer.innerHTML).toMatch(/ms$/);
      }
    );
  });

  it('should include line if provided', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepFailure', spec, step, 'error');
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    var errorHtml = context.find('#describe-10 .tests li pre').html();
    expect(errorHtml.indexOf('unknown:-1')).toEqual(0);
  });

});
'use strict';

describe('angular.scenario.output.object', function() {
  var output;
  var runner, model, $window;
  var spec, step;

  beforeEach(function() {
    $window = {};
    runner = new angular.scenario.testing.MockRunner();
    model = new angular.scenario.ObjectModel(runner);
    runner.$window = $window;
    output = angular.scenario.output.object(null, runner, model);
    spec = {
      name: 'test spec',
      definition: {
        id: 10,
        name: 'describe',
        children: []
      }
    };
    step = {
      name: 'some step',
      line: function() { return 'unknown:-1'; }
    };
  });

  it('should create a global variable $result', function() {
    expect($window.$result).toBeDefined();
  });

  it('should maintain live state in $result', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);

    expect($window.$result.children['describe']
      .specs['test spec'].steps[0].duration).toBeDefined();
  });
});
'use strict';

describe('angular.scenario.output.xml', function() {
  var output, context;
  var runner, model, $window;
  var spec, step;

  beforeEach(function() {
    $window = {};
    context = _jQuery('<div></div>');
    runner = new angular.scenario.testing.MockRunner();
    model = new angular.scenario.ObjectModel(runner);
    output = angular.scenario.output.xml(context, runner, model);
    spec = {
      name: 'test spec',
      definition: {
        id: 10,
        name: 'describe'
      }
    };
    step = {
      name: 'some step',
      line: function() { return 'unknown:-1'; }
    };
  });

  it('should create XML nodes for object model', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);
    runner.emit('RunnerEnd');
    expect(context.find('it').attr('status')).toEqual('success');
    expect(context.find('it step').attr('status')).toEqual('success');
  });

  it('should output errors to the XML', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepFailure', spec, step, 'error reason');
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);
    runner.emit('RunnerEnd');

    expect(context.find('it').attr('status')).toEqual('failure');
    expect(context.find('it step').attr('status')).toEqual('failure');
    expect(context.find('it step').text()).toEqual('error reason');
  });
});
/* global using: false, binding: false, input: false, select: false, repeater: false */
'use strict';

describe('widgets', function() {
  it('should verify that basic widgets work', function() {
    browser().navigateTo('widgets.html');

    using('#text-basic-box').input('text.basic').enter('Carlos');
    expect(binding('text.basic')).toEqual('Carlos');
    input('text.basic').enter('Carlos Santana');
    expect(binding('text.basic')).not().toEqual('Carlos Boozer');

    input('text.password').enter('secret');
    expect(binding('text.password')).toEqual('secret');

    expect(binding('text.hidden')).toEqual('hiddenValue');

    expect(binding('gender')).toEqual('male');
    input('gender').select('female');
    expect(using('#gender-box').binding('gender')).toEqual('female');

    expect(repeater('#repeater-row ul li').count()).toEqual(2);
    expect(repeater('#repeater-row ul li').row(1)).toEqual(['adam']);
    expect(repeater('#repeater-row ul li').column('name')).toEqual(['misko', 'adam']);

    select('select').option('B');
    expect(binding('select')).toEqual('B');

    select('multiselect').options('A', 'C');
    expect(binding('multiselect').fromJson()).toEqual(['A', 'C']);

    expect(binding('button').fromJson()).toEqual({'count': 0});
    expect(binding('form').fromJson()).toEqual({'count': 0});

    element('form a', '\'action\' link').click();
    expect(binding('button').fromJson()).toEqual({'count': 1});

    element('input[value="submit input"]', '\'submit input\' button').click();
    expect(binding('button').fromJson()).toEqual({'count': 2});
    expect(binding('form').fromJson()).toEqual({'count': 1});

    element('button:contains("submit button")', '\'submit button\' button').click();
    expect(binding('button').fromJson()).toEqual({'count': 2});
    expect(binding('form').fromJson()).toEqual({'count': 2});

    element('input[value="button"]', '\'button\' button').click();
    expect(binding('button').fromJson()).toEqual({'count': 3});

    element('input[type="image"]', 'form image').click();
    expect(binding('button').fromJson()).toEqual({'count': 4});

    /**
     * Custom value parser for futures.
     */
    function checkboxParser(value) {
      // eslint-disable-next-line no-undef
      return angular.fromJson(value.substring(value.indexOf('=') + 1));
    }

    input('checkbox.tea').check();
    expect(binding('checkbox').parsedWith(checkboxParser)).toEqual({coffee: false, tea: false});
    input('checkbox.coffee').check();
    expect(binding('checkbox').parsedWith(checkboxParser)).toEqual({coffee: true, tea: false});
    input('checkbox.tea').check();
    input('checkbox.tea').check();
    input('checkbox.tea').check();
    expect(binding('checkbox').parsedWith(checkboxParser)).toEqual({coffee: true, tea: true});
  });
});
'use strict';

describe('angular.scenario.ObjectModel', function() {
  var model;
  var runner;
  var spec, step;

  function buildSpec(id, name, definitions) {
    var spec = {
      id: id,
      name: name,
      definition: {
        name: definitions.shift()
      }
    };
    var currentDef = spec.definition;

    forEach(definitions, function(defName) {
      currentDef.parent = {
        name: defName
      };
      currentDef = currentDef.parent;
    });

    return spec;
  }

  function buildStep(name, line) {
    return {
      name: name || 'test step',
      line: function() { return line || ''; }
    };
  }

  beforeEach(function() {
    spec = buildSpec(1, 'test spec', ['describe 1']);
    step = buildStep();
    runner = new angular.scenario.testing.MockRunner();
    model = new angular.scenario.ObjectModel(runner);
  });

  it('should value default empty value', function() {
    expect(model.value).toEqual({
      name: '',
      children: {}
    });
  });

  it('should add spec and create describe blocks on SpecBegin event', function() {
    runner.emit('SpecBegin', buildSpec(1, 'test spec', ['describe 2', 'describe 1']));

    expect(model.value.children['describe 1']).toBeDefined();
    expect(model.value.children['describe 1'].children['describe 2']).toBeDefined();
    expect(model.value.children['describe 1'].children['describe 2'].specs['test spec']).toBeDefined();
  });

  it('should set fullDefinitionName on SpecBegin event', function() {
    runner.emit('SpecBegin', buildSpec(1, 'fake spec', ['describe 2']));
    var spec = model.getSpec(1);

    expect(spec.fullDefinitionName).toBeDefined();
    expect(spec.fullDefinitionName).toEqual('describe 2');
  });

  it('should set fullDefinitionName on SpecBegin event (join more names by space)', function() {
    runner.emit('SpecBegin', buildSpec(1, 'fake spec', ['describe 2', 'describe 1']));
    var spec = model.getSpec(1);

    expect(spec.fullDefinitionName).toEqual('describe 1 describe 2');
  });

  it('should add step to spec on StepBegin', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    expect(model.value.children['describe 1'].specs['test spec'].steps.length).toEqual(1);
  });

  it('should update spec timer duration on SpecEnd event', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('SpecEnd', spec);

    expect(model.value.children['describe 1'].specs['test spec'].duration).toBeDefined();
  });

  it('should update step timer duration on StepEnd event', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    expect(model.value.children['describe 1'].specs['test spec'].steps[0].duration).toBeDefined();
  });

  it('should set spec status on SpecEnd to success if no status set', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('SpecEnd', spec);

    expect(model.value.children['describe 1'].specs['test spec'].status).toEqual('success');
  });

  it('should set status to error after SpecError', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('SpecError', spec, 'error');

    expect(model.value.children['describe 1'].specs['test spec'].status).toEqual('error');
  });

  it('should set spec status to failure if step fails', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepFailure', spec, step, 'error');
    runner.emit('StepEnd', spec, step);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    expect(model.value.children['describe 1'].specs['test spec'].status).toEqual('failure');
  });

  it('should set spec status to error if step errors', function() {
    runner.emit('SpecBegin', spec);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepError', spec, step, 'error');
    runner.emit('StepEnd', spec, step);
    runner.emit('StepBegin', spec, step);
    runner.emit('StepFailure', spec, step, 'error');
    runner.emit('StepEnd', spec, step);
    runner.emit('SpecEnd', spec);

    expect(model.value.children['describe 1'].specs['test spec'].status).toEqual('error');
  });

  describe('events', function() {
    var Spec = angular.scenario.ObjectModel.Spec,
        Step = angular.scenario.ObjectModel.Step,
        callback;

    beforeEach(function() {
      callback = jasmine.createSpy('listener');
    });

    it('should provide method for registering a listener', function() {
      expect(model.on).toBeDefined();
      expect(model.on instanceof Function).toBe(true);
    });

    it('should forward SpecBegin event', function() {
      model.on('SpecBegin', callback);
      runner.emit('SpecBegin', spec);

      expect(callback).toHaveBeenCalled();
    });

    it('should forward SpecBegin event with ObjectModel.Spec as a param', function() {
      model.on('SpecBegin', callback);
      runner.emit('SpecBegin', spec);

      expect(callback.calls.mostRecent().args[0] instanceof Spec).toBe(true);
      expect(callback.calls.mostRecent().args[0].name).toEqual(spec.name);
    });

    it('should forward SpecError event', function() {
      model.on('SpecError', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('SpecError', spec, {});

      expect(callback).toHaveBeenCalled();
    });

    it('should forward SpecError event with ObjectModel.Spec and error as a params', function() {
      var error = {};
      model.on('SpecError', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('SpecError', spec, error);

      var param = callback.calls.mostRecent().args[0];
      expect(param instanceof Spec).toBe(true);
      expect(param.name).toEqual(spec.name);
      expect(param.status).toEqual('error');
      expect(param.error).toBe(error);
    });

    it('should forward SpecEnd event', function() {
      model.on('SpecEnd', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('SpecEnd', spec);

      expect(callback).toHaveBeenCalled();
    });

    it('should forward SpecEnd event with ObjectModel.Spec as a param', function() {
      model.on('SpecEnd', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('SpecEnd', spec);

      expect(callback.calls.mostRecent().args[0] instanceof Spec).toBe(true);
      expect(callback.calls.mostRecent().args[0].name).toEqual(spec.name);
    });

    it('should forward StepBegin event', function() {
      model.on('StepBegin', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);

      expect(callback).toHaveBeenCalled();
    });

    it('should forward StepBegin event with Spec and Step as params', function() {
      model.on('StepBegin', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);

      var params = callback.calls.mostRecent().args;
      expect(params[0] instanceof Spec).toBe(true);
      expect(params[0].name).toEqual(spec.name);
      expect(params[1] instanceof Step).toBe(true);
    });

    it('should forward StepError event', function() {
      model.on('StepError', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepError', spec, step, {});

      expect(callback).toHaveBeenCalled();
    });

    it('should forward StepError event with Spec, Step and error as params', function() {
      var error = {};
      model.on('StepError', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepError', spec, step, error);

      var params = callback.calls.mostRecent().args;
      expect(params[0] instanceof Spec).toBe(true);
      expect(params[0].name).toEqual(spec.name);
      expect(params[1] instanceof Step).toBe(true);
      expect(params[1].status).toEqual('error');
      expect(params[2]).toBe(error);
    });

    it('should forward StepFailure event', function() {
      model.on('StepFailure', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepFailure', spec, step, {});

      expect(callback).toHaveBeenCalled();
    });

    it('should forward StepFailure event with Spec, Step and error as params', function() {
      var error = {};
      model.on('StepFailure', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepFailure', spec, step, error);

      var params = callback.calls.mostRecent().args;
      expect(params[0] instanceof Spec).toBe(true);
      expect(params[0].name).toEqual(spec.name);
      expect(params[1] instanceof Step).toBe(true);
      expect(params[1].status).toEqual('failure');
      expect(params[2]).toBe(error);
    });

    it('should forward StepEnd event', function() {
      model.on('StepEnd', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepEnd', spec, step);

      expect(callback).toHaveBeenCalled();
    });

    it('should forward StepEnd event with Spec and Step as params', function() {
      model.on('StepEnd', callback);
      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepEnd', spec, step);

      var params = callback.calls.mostRecent().args;
      expect(params[0] instanceof Spec).toBe(true);
      expect(params[0].name).toEqual(spec.name);
      expect(params[1] instanceof Step).toBe(true);
    });

    it('should forward RunnerEnd event', function() {
      model.on('RunnerEnd', callback);
      runner.emit('RunnerEnd');
      expect(callback).toHaveBeenCalled();
    });

    it('should set error of first failure', function() {
      var error = 'first-error',
          step2 = buildStep();

      model.on('SpecEnd', function(spec) {
        expect(spec.error).toBeDefined();
        expect(spec.error).toBe(error);
      });

      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepFailure', spec, step, error);
      runner.emit('StepBegin', spec, step2);
      runner.emit('StepFailure', spec, step2, 'second-error');
      runner.emit('SpecEnd', spec);
    });

    it('should set line number of first failure', function() {
      var step = buildStep('fake', 'first-line'),
          step2 = buildStep('fake2', 'second-line');

      model.on('SpecEnd', function(spec) {
        expect(spec.line).toBeDefined();
        expect(spec.line).toBe('first-line');
      });

      runner.emit('SpecBegin', spec);
      runner.emit('StepBegin', spec, step);
      runner.emit('StepFailure', spec, step, null);
      runner.emit('StepBegin', spec, step2);
      runner.emit('StepFailure', spec, step2, null);
      runner.emit('SpecEnd', spec);
    });
  });
});
'use strict';

/**
 * Mock spec runner.
 */
function MockSpecRunner() {}
MockSpecRunner.prototype.run = function(spec, specDone) {
  spec.before.call(this);
  spec.body.call(this);
  spec.after.call(this);
  specDone();
};

MockSpecRunner.prototype.addFuture = function(name, fn, line) {
  return {name: name, fn: fn, line: line};
};

describe('angular.scenario.Runner', function() {
  var $window;
  var runner;

  beforeEach(function() {
    // Trick to get the scope out of a DSL statement
    angular.scenario.dsl('dslAddFuture', function() {
      return function() {
        return this.addFuture('future name', angular.noop);
      };
    });
    // Trick to get the scope out of a DSL statement
    angular.scenario.dsl('dslScope', function() {
      var scope = this;
      return function() { return scope; };
    });
    // Trick to get the scope out of a DSL statement
    angular.scenario.dsl('dslChain', function() {
      return function() {
        this.chained = 0;
        this.chain = function() { this.chained++; return this; };
        return this;
      };
    });
    $window = {
      location: {}
    };
    runner = new angular.scenario.Runner($window);
    runner.on('SpecError', angular.mock.rethrow);
    runner.on('StepError', angular.mock.rethrow);
  });

  afterEach(function() {
    delete angular.scenario.dsl.dslScope;
    delete angular.scenario.dsl.dslChain;
  });

  it('should publish the functions in the public API', function() {
    angular.forEach(runner.api, function(fn, name) {
      var func;
      if (name in $window) {
        func = $window[name];
      }
      expect(angular.isFunction(func)).toBeTruthy();
    });
  });

  it('should construct valid describe trees with public API', function() {
    var before = [];
    var after = [];
    $window.describe('A', function() {
      $window.beforeEach(function() { before.push('A'); });
      $window.afterEach(function() { after.push('A'); });
      $window.it('1', angular.noop);
      $window.describe('B', function() {
        $window.beforeEach(function() { before.push('B'); });
        $window.afterEach(function() { after.push('B'); });
        $window.it('2', angular.noop);
        $window.describe('C', function() {
          $window.beforeEach(function() { before.push('C'); });
          $window.afterEach(function() { after.push('C'); });
          $window.it('3', angular.noop);
        });
      });
    });
    var specs = runner.rootDescribe.getSpecs();
    specs[0].before();
    specs[0].body();
    specs[0].after();
    expect(before).toEqual(['A', 'B', 'C']);
    expect(after).toEqual(['C', 'B', 'A']);
    expect(specs[2].definition.parent).toEqual(runner.rootDescribe);
    expect(specs[0].definition.parent).toEqual(specs[2].definition.children[0]);
  });

  it('should publish the DSL statements to the $window', function() {
    $window.describe('describe', function() {
      $window.it('1', function() {
        expect($window.dslScope).toBeDefined();
      });
    });
    runner.run(null/*application*/);
  });

  it('should create a new scope for each DSL chain', function() {
    $window.describe('describe', function() {
      $window.it('1', function() {
        var scope = $window.dslScope();
        scope.test = 'foo';
        expect($window.dslScope().test).toBeUndefined();
      });
      $window.it('2', function() {
        var scope = $window.dslChain().chain().chain();
        expect(scope.chained).toEqual(2);
      });
    });
    runner.run(null/*application*/);
  });
});
'use strict';

describe('angular.scenario.Application', function() {
  var $window;
  var app, frames;

  function callLoadHandlers(app) {
    var handler = app.getFrame_().triggerHandler('load');
  }

  beforeEach(function() {
    window.document.body.innerHTML = '';
    frames = _jQuery('<div></div>');
    _jQuery(window.document.body).append(frames);
    app = new angular.scenario.Application(frames);
  });


  afterEach(function() {
    _jQuery('iframe').off(); // cleanup any leftover onload handlers
    window.document.body.innerHTML = '';
  });


  it('should return new $window and $document after navigateTo', function() {
    var called;
    var testWindow, testDocument, counter = 0;
    app.getWindow_ = function() {
      return {x:counter++, document:{x:counter++}};
    };
    app.navigateTo('http://www.google.com/');
    app.executeAction(function($window, $document) {
      testWindow = $window;
      testDocument = $document;
    });
    app.navigateTo('http://www.google.com/');
    app.executeAction(function($window, $document) {
      expect($window).not.toEqual(testWindow);
      expect($document).not.toEqual(testDocument);
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it('should execute callback with correct arguments', function() {
    var called;
    var testWindow = {document: {}};
    app.getWindow_ = function() {
      return testWindow;
    };
    app.executeAction(function($window, $document) {
      expect(this).toEqual(app);
      expect($document).toEqual(_jQuery($window.document));
      expect($window).toEqual(testWindow);
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it('should use a new iframe each time', function() {
    app.navigateTo('http://localhost/');
    var frame = app.getFrame_();
    frame.attr('test', true);
    app.navigateTo('http://localhost/');
    expect(app.getFrame_().attr('test')).toBeFalsy();
  });

  it('should call error handler if document not accessible', function() {
    var called;
    app.getWindow_ = function() {
      return {};
    };
    app.navigateTo('http://localhost/', angular.noop, function(error) {
      expect(error).toMatch(/Sandbox Error/);
      called = true;
    });
    callLoadHandlers(app);
    expect(called).toBeTruthy();
  });

  it('should call error handler if navigating to about:blank', function() {
    var called;
    app.navigateTo('about:blank', angular.noop, function(error) {
      expect(error).toMatch(/Sandbox Error/);
      called = true;
    });
    expect(called).toBeTruthy();
  });

  it('should remove old iframes', function() {
    app.navigateTo('http://localhost/#foo');
    frames.find('iframe')[0].id = 'test';

    app.navigateTo('http://localhost/#bar');
    var iframes = frames.find('iframe');

    expect(iframes.length).toEqual(1);
    expect(iframes[0].src).toEqual('http://localhost/#bar');
    expect(iframes[0].id).toBeFalsy();
  });

  it('should URL update description bar', function() {
    app.navigateTo('http://localhost/');
    var anchor = frames.find('> h2 a');
    expect(anchor.attr('href')).toEqual('http://localhost/');
    expect(anchor.text()).toEqual('http://localhost/');
  });

  it('should call onload handler when frame loads', function() {
    var called;
    app.getWindow_ = function() {
      return {document: {}};
    };
    app.navigateTo('http://localhost/', function($window, $document) {
      called = true;
    });
    callLoadHandlers(app);
    expect(called).toBeTruthy();
  });

  it('should set rootElement when navigateTo instigates bootstrap', inject(function($injector, $browser) {
    var called;
    var testWindow = {
      document: jqLite('<div class="test-foo"></div>')[0],
      angular: {
        element: jqLite,
        service: {},
        resumeBootstrap: noop
      }
    };
    jqLite(testWindow.document).data('$injector', $injector);
    var resumeBootstrapSpy = spyOn(testWindow.angular, 'resumeBootstrap').and.returnValue($injector);

    var injectorGet = $injector.get;
    spyOn($injector, 'get').and.callFake(function(name) {
      switch (name) {
        case '$rootElement': return jqLite(testWindow.document);
        default: return injectorGet(name);
      }
    });

    app.getWindow_ = function() {
      return testWindow;
    };
    app.navigateTo('http://localhost/', noop);
    callLoadHandlers(app);
    expect(app.rootElement).toBe(testWindow.document);
    expect(resumeBootstrapSpy).toHaveBeenCalled();
    dealoc(testWindow.document);
  }));

  it('should set setup resumeDeferredBootstrap if resumeBootstrap is not yet defined', inject(function($injector, $browser) {
    var called;
    var testWindow = {
      document: jqLite('<div class="test-foo"></div>')[0],
      angular: {
        element: jqLite,
        service: {},
        resumeBootstrap: null
      }
    };
    jqLite(testWindow.document).data('$injector', $injector);

    var injectorGet = $injector.get;
    var injectorSpy = spyOn($injector, 'get').and.callFake(function(name) {
      switch (name) {
        case '$rootElement': return jqLite(testWindow.document);
        default: return injectorGet(name);
      }
    });

    app.getWindow_ = function() {
      return testWindow;
    };
    app.navigateTo('http://localhost/', noop);
    expect(testWindow.angular.resumeDeferredBootstrap).toBeUndefined();
    callLoadHandlers(app);
    expect(testWindow.angular.resumeDeferredBootstrap).toBeDefined();
    expect(app.rootElement).toBeUndefined();
    expect(injectorSpy).not.toHaveBeenCalled();

    var resumeBootstrapSpy = spyOn(testWindow.angular, 'resumeBootstrap').and.returnValue($injector);
    testWindow.angular.resumeDeferredBootstrap();
    expect(app.rootElement).toBe(testWindow.document);
    expect(resumeBootstrapSpy).toHaveBeenCalled();
    expect(injectorSpy).toHaveBeenCalledWith('$rootElement');
    dealoc(testWindow.document);
  }));

  it('should wait for pending requests in executeAction', inject(function($injector, $browser) {
    var called, polled;
    var handlers = [];
    var testWindow = {
      document: jqLite('<div class="test-foo" ng-app></div>')[0],
      angular: {
        element: jqLite,
        service: {}
      }
    };
    $browser.notifyWhenNoOutstandingRequests = function(fn) {
      handlers.push(fn);
    };
    jqLite(testWindow.document).data('$injector', $injector);
    app.getWindow_ = function() {
      return testWindow;
    };
    app.executeAction(function($window, $document) {
      expect($window).toEqual(testWindow);
      expect($document).toBeDefined();
      expect($document[0].className).toEqual('test-foo');
    });
    expect(handlers.length).toEqual(1);
    handlers[0]();
    dealoc(testWindow.document);
  }));

  it('should allow explicit rootElement', inject(function($injector, $browser) {
    var called, polled;
    var handlers = [];
    var testWindow = {
      document: jqLite('<div class="test-foo"></div>')[0],
      angular: {
        element: jqLite,
        service: {}
      }
    };
    $browser.notifyWhenNoOutstandingRequests = function(fn) {
      handlers.push(fn);
    };
    app.rootElement = testWindow.document;
    jqLite(testWindow.document).data('$injector', $injector);
    app.getWindow_ = function() {
      return testWindow;
    };
    app.executeAction(function($window, $document) {
      expect($window).toEqual(testWindow);
      expect($document).toBeDefined();
      expect($document[0].className).toEqual('test-foo');
    });
    expect(handlers.length).toEqual(1);
    handlers[0]();
    dealoc(testWindow.document);
  }));
});
'use strict';

describe('ngMock', function() {
  var noop = angular.noop;

  describe('TzDate', function() {

    function minutes(min) {
      return min * 60 * 1000;
    }

    it('should look like a Date', function() {
      var date = new angular.mock.TzDate(0,0);
      expect(angular.isDate(date)).toBe(true);
    });

    it('should take millis as constructor argument', function() {
      expect(new angular.mock.TzDate(0, 0).getTime()).toBe(0);
      expect(new angular.mock.TzDate(0, 1283555108000).getTime()).toBe(1283555108000);
    });

    it('should take dateString as constructor argument', function() {
      expect(new angular.mock.TzDate(0, '1970-01-01T00:00:00.000Z').getTime()).toBe(0);
      expect(new angular.mock.TzDate(0, '2010-09-03T23:05:08.023Z').getTime()).toBe(1283555108023);
    });


    it('should fake getLocalDateString method', function() {
      var millennium = new Date('2000').getTime();

      // millennium in -3h
      var t0 = new angular.mock.TzDate(-3, millennium);
      expect(t0.toLocaleDateString()).toMatch('2000');

      // millennium in +0h
      var t1 = new angular.mock.TzDate(0, millennium);
      expect(t1.toLocaleDateString()).toMatch('2000');

      // millennium in +3h
      var t2 = new angular.mock.TzDate(3, millennium);
      expect(t2.toLocaleDateString()).toMatch('1999');
    });


    it('should fake toISOString method', function() {
      var date = new angular.mock.TzDate(-1, '2009-10-09T01:02:03.027Z');

      if (new Date().toISOString) {
        expect(date.toISOString()).toEqual('2009-10-09T01:02:03.027Z');
      } else {
        expect(date.toISOString).toBeUndefined();
      }
    });


    it('should fake getHours method', function() {
      // avoid going negative due to #5017, so use Jan 2, 1970 00:00 UTC
      var jan2 = 24 * 60 * 60 * 1000;

      //0:00 in -3h
      var t0 = new angular.mock.TzDate(-3, jan2);
      expect(t0.getHours()).toBe(3);

      //0:00 in +0h
      var t1 = new angular.mock.TzDate(0, jan2);
      expect(t1.getHours()).toBe(0);

      //0:00 in +3h
      var t2 = new angular.mock.TzDate(3, jan2);
      expect(t2.getHours()).toMatch('21');
    });


    it('should fake getMinutes method', function() {
      //0:15 in -3h
      var t0 = new angular.mock.TzDate(-3, minutes(15));
      expect(t0.getMinutes()).toBe(15);

      //0:15 in -3.25h
      var t0a = new angular.mock.TzDate(-3.25, minutes(15));
      expect(t0a.getMinutes()).toBe(30);

      //0 in +0h
      var t1 = new angular.mock.TzDate(0, minutes(0));
      expect(t1.getMinutes()).toBe(0);

      //0:15 in +0h
      var t1a = new angular.mock.TzDate(0, minutes(15));
      expect(t1a.getMinutes()).toBe(15);

      //0:15 in +3h
      var t2 = new angular.mock.TzDate(3, minutes(15));
      expect(t2.getMinutes()).toMatch('15');

      //0:15 in +3.25h
      var t2a = new angular.mock.TzDate(3.25, minutes(15));
      expect(t2a.getMinutes()).toMatch('0');
    });


    it('should fake getSeconds method', function() {
      //0 in -3h
      var t0 = new angular.mock.TzDate(-3, 0);
      expect(t0.getSeconds()).toBe(0);

      //0 in +0h
      var t1 = new angular.mock.TzDate(0, 0);
      expect(t1.getSeconds()).toBe(0);

      //0 in +3h
      var t2 = new angular.mock.TzDate(3, 0);
      expect(t2.getSeconds()).toMatch('0');
    });


    it('should fake getMilliseconds method', function() {
      expect(new angular.mock.TzDate(0, '2010-09-03T23:05:08.003Z').getMilliseconds()).toBe(3);
      expect(new angular.mock.TzDate(0, '2010-09-03T23:05:08.023Z').getMilliseconds()).toBe(23);
      expect(new angular.mock.TzDate(0, '2010-09-03T23:05:08.123Z').getMilliseconds()).toBe(123);
    });


    it('should create a date representing new year in Bratislava', function() {
      var newYearInBratislava = new angular.mock.TzDate(-1, '2009-12-31T23:00:00.000Z');
      expect(newYearInBratislava.getTimezoneOffset()).toBe(-60);
      expect(newYearInBratislava.getFullYear()).toBe(2010);
      expect(newYearInBratislava.getMonth()).toBe(0);
      expect(newYearInBratislava.getDate()).toBe(1);
      expect(newYearInBratislava.getHours()).toBe(0);
      expect(newYearInBratislava.getMinutes()).toBe(0);
      expect(newYearInBratislava.getSeconds()).toBe(0);
    });


    it('should delegate all the UTC methods to the original UTC Date object', function() {
      //from when created from string
      var date1 = new angular.mock.TzDate(-1, '2009-12-31T23:00:00.000Z');
      expect(date1.getUTCFullYear()).toBe(2009);
      expect(date1.getUTCMonth()).toBe(11);
      expect(date1.getUTCDate()).toBe(31);
      expect(date1.getUTCHours()).toBe(23);
      expect(date1.getUTCMinutes()).toBe(0);
      expect(date1.getUTCSeconds()).toBe(0);


      //from when created from millis
      var date2 = new angular.mock.TzDate(-1, date1.getTime());
      expect(date2.getUTCFullYear()).toBe(2009);
      expect(date2.getUTCMonth()).toBe(11);
      expect(date2.getUTCDate()).toBe(31);
      expect(date2.getUTCHours()).toBe(23);
      expect(date2.getUTCMinutes()).toBe(0);
      expect(date2.getUTCSeconds()).toBe(0);
    });


    it('should throw error when no third param but toString called', function() {
      expect(function() { new angular.mock.TzDate(0,0).toString(); }).
                           toThrowError('Method \'toString\' is not implemented in the TzDate mock');
    });
  });


  describe('$log', function() {
    angular.forEach([true, false], function(debugEnabled) {
      describe('debug ' + debugEnabled, function() {
        beforeEach(module(function($logProvider) {
          $logProvider.debugEnabled(debugEnabled);
        }));

        afterEach(inject(function($log) {
          $log.reset();
        }));

        it('should skip debugging output if disabled (' + debugEnabled + ')', inject(function($log) {
            $log.log('fake log');
            $log.info('fake log');
            $log.warn('fake log');
            $log.error('fake log');
            $log.debug('fake log');
            expect($log.log.logs).toContain(['fake log']);
            expect($log.info.logs).toContain(['fake log']);
            expect($log.warn.logs).toContain(['fake log']);
            expect($log.error.logs).toContain(['fake log']);
            if (debugEnabled) {
              expect($log.debug.logs).toContain(['fake log']);
            } else {
              expect($log.debug.logs).toEqual([]);
            }
          }));
      });
    });

    describe('debug enabled (default)', function() {
      var $log;
      beforeEach(inject(['$log', function(log) {
        $log = log;
      }]));

      afterEach(inject(function($log) {
        $log.reset();
      }));

      it('should provide the log method', function() {
        expect(function() { $log.log(''); }).not.toThrow();
      });

      it('should provide the info method', function() {
        expect(function() { $log.info(''); }).not.toThrow();
      });

      it('should provide the warn method', function() {
        expect(function() { $log.warn(''); }).not.toThrow();
      });

      it('should provide the error method', function() {
        expect(function() { $log.error(''); }).not.toThrow();
      });

      it('should provide the debug method', function() {
        expect(function() { $log.debug(''); }).not.toThrow();
      });

      it('should store log messages', function() {
        $log.log('fake log');
        expect($log.log.logs).toContain(['fake log']);
      });

      it('should store info messages', function() {
        $log.info('fake log');
        expect($log.info.logs).toContain(['fake log']);
      });

      it('should store warn messages', function() {
        $log.warn('fake log');
        expect($log.warn.logs).toContain(['fake log']);
      });

      it('should store error messages', function() {
        $log.error('fake log');
        expect($log.error.logs).toContain(['fake log']);
      });

      it('should store debug messages', function() {
        $log.debug('fake log');
        expect($log.debug.logs).toContain(['fake log']);
      });

      it('should assertEmpty', function() {
        try {
          $log.error(new Error('MyError'));
          $log.warn(new Error('MyWarn'));
          $log.info(new Error('MyInfo'));
          $log.log(new Error('MyLog'));
          $log.debug(new Error('MyDebug'));
          $log.assertEmpty();
        } catch (error) {
          var err = error.message || error;
          expect(err).toMatch(/Error: MyError/m);
          expect(err).toMatch(/Error: MyWarn/m);
          expect(err).toMatch(/Error: MyInfo/m);
          expect(err).toMatch(/Error: MyLog/m);
          expect(err).toMatch(/Error: MyDebug/m);
        } finally {
          $log.reset();
        }
      });

      it('should reset state', function() {
        $log.error(new Error('MyError'));
        $log.warn(new Error('MyWarn'));
        $log.info(new Error('MyInfo'));
        $log.log(new Error('MyLog'));
        $log.reset();
        var passed = false;
        try {
          $log.assertEmpty(); // should not throw error!
          passed = true;
        } catch (e) {
          passed = e;
        }
        expect(passed).toBe(true);
      });
    });
  });


  describe('$interval', function() {
    it('should run tasks repeatedly', inject(function($interval) {
      var counter = 0;
      $interval(function() { counter++; }, 1000);

      expect(counter).toBe(0);

      $interval.flush(1000);
      expect(counter).toBe(1);

      $interval.flush(1000);
      expect(counter).toBe(2);

      $interval.flush(2000);
      expect(counter).toBe(4);
    }));


    it('should call $apply after each task is executed', inject(function($interval, $rootScope) {
      var applySpy = spyOn($rootScope, '$apply').and.callThrough();

      $interval(noop, 1000);
      expect(applySpy).not.toHaveBeenCalled();

      $interval.flush(1000);
      expect(applySpy).toHaveBeenCalledOnce();

      applySpy.calls.reset();

      $interval(noop, 1000);
      $interval(noop, 1000);
      $interval.flush(1000);
      expect(applySpy).toHaveBeenCalledTimes(3);
    }));


    it('should NOT call $apply if invokeApply is set to false',
        inject(function($interval, $rootScope) {
      var applySpy = spyOn($rootScope, '$apply').and.callThrough();

      var counter = 0;
      $interval(function increment() { counter++; }, 1000, 0, false);

      expect(applySpy).not.toHaveBeenCalled();
      expect(counter).toBe(0);

      $interval.flush(2000);
      expect(applySpy).not.toHaveBeenCalled();
      expect(counter).toBe(2);
    }));


    it('should allow you to specify the delay time', inject(function($interval) {
      var counter = 0;
      $interval(function() { counter++; }, 123);

      expect(counter).toBe(0);

      $interval.flush(122);
      expect(counter).toBe(0);

      $interval.flush(1);
      expect(counter).toBe(1);
    }));


    it('should allow you to NOT specify the delay time', inject(function($interval) {
      var counterA = 0;
      var counterB = 0;

      $interval(function() { counterA++; });
      $interval(function() { counterB++; }, 0);

      $interval.flush(100);
      expect(counterA).toBe(100);
      expect(counterB).toBe(100);
      $interval.flush(100);
      expect(counterA).toBe(200);
      expect(counterB).toBe(200);
    }));


    it('should run tasks in correct relative order', inject(function($interval) {
      var counterA = 0;
      var counterB = 0;
      $interval(function() { counterA++; }, 0);
      $interval(function() { counterB++; }, 1000);

      $interval.flush(1000);
      expect(counterA).toBe(1000);
      expect(counterB).toBe(1);
      $interval.flush(999);
      expect(counterA).toBe(1999);
      expect(counterB).toBe(1);
      $interval.flush(1);
      expect(counterA).toBe(2000);
      expect(counterB).toBe(2);
    }));


    it('should NOT trigger zero-delay interval when flush has ran before', inject(function($interval) {
      var counterA = 0;
      var counterB = 0;

      $interval.flush(100);

      $interval(function() { counterA++; });
      $interval(function() { counterB++; }, 0);

      expect(counterA).toBe(0);
      expect(counterB).toBe(0);

      $interval.flush(100);

      expect(counterA).toBe(100);
      expect(counterB).toBe(100);
    }));


    it('should trigger zero-delay interval only once on flush zero', inject(function($interval) {
      var counterA = 0;
      var counterB = 0;

      $interval(function() { counterA++; });
      $interval(function() { counterB++; }, 0);

      $interval.flush(0);
      expect(counterA).toBe(1);
      expect(counterB).toBe(1);
      $interval.flush(0);
      expect(counterA).toBe(1);
      expect(counterB).toBe(1);
    }));


    it('should allow you to specify a number of iterations', inject(function($interval) {
      var counter = 0;
      $interval(function() {counter++;}, 1000, 2);

      $interval.flush(1000);
      expect(counter).toBe(1);
      $interval.flush(1000);
      expect(counter).toBe(2);
      $interval.flush(1000);
      expect(counter).toBe(2);
    }));


    describe('flush', function() {
      it('should move the clock forward by the specified time', inject(function($interval) {
        var counterA = 0;
        var counterB = 0;
        $interval(function() { counterA++; }, 100);
        $interval(function() { counterB++; }, 401);

        $interval.flush(200);
        expect(counterA).toEqual(2);

        $interval.flush(201);
        expect(counterA).toEqual(4);
        expect(counterB).toEqual(1);
      }));
    });


    it('should return a promise which will be updated with the count on each iteration',
        inject(function($interval) {
      var log = [],
          promise = $interval(function() { log.push('tick'); }, 1000);

      promise.then(function(value) { log.push('promise success: ' + value); },
                   function(err) { log.push('promise error: ' + err); },
                   function(note) { log.push('promise update: ' + note); });
      expect(log).toEqual([]);

      $interval.flush(1000);
      expect(log).toEqual(['tick', 'promise update: 0']);

      $interval.flush(1000);
      expect(log).toEqual(['tick', 'promise update: 0', 'tick', 'promise update: 1']);
    }));


    it('should return a promise which will be resolved after the specified number of iterations',
        inject(function($interval) {
      var log = [],
          promise = $interval(function() { log.push('tick'); }, 1000, 2);

      promise.then(function(value) { log.push('promise success: ' + value); },
                   function(err) { log.push('promise error: ' + err); },
                   function(note) { log.push('promise update: ' + note); });
      expect(log).toEqual([]);

      $interval.flush(1000);
      expect(log).toEqual(['tick', 'promise update: 0']);
      $interval.flush(1000);

      expect(log).toEqual([
        'tick', 'promise update: 0', 'tick', 'promise update: 1', 'promise success: 2'
      ]);

    }));


    describe('exception handling', function() {
      beforeEach(module(function($exceptionHandlerProvider) {
        $exceptionHandlerProvider.mode('log');
      }));


      it('should delegate exception to the $exceptionHandler service', inject(
          function($interval, $exceptionHandler) {
        $interval(function() { throw 'Test Error'; }, 1000);
        expect($exceptionHandler.errors).toEqual([]);

        $interval.flush(1000);
        expect($exceptionHandler.errors).toEqual(['Test Error']);

        $interval.flush(1000);
        expect($exceptionHandler.errors).toEqual(['Test Error', 'Test Error']);
      }));


      it('should call $apply even if an exception is thrown in callback', inject(
          function($interval, $rootScope) {
        var applySpy = spyOn($rootScope, '$apply').and.callThrough();

        $interval(function() { throw new Error('Test Error'); }, 1000);
        expect(applySpy).not.toHaveBeenCalled();

        $interval.flush(1000);
        expect(applySpy).toHaveBeenCalled();
      }));


      it('should still update the interval promise when an exception is thrown',
          inject(function($interval) {
        var log = [],
            promise = $interval(function() { throw new Error('Some Error'); }, 1000);

        promise.then(function(value) { log.push('promise success: ' + value); },
                   function(err) { log.push('promise error: ' + err); },
                   function(note) { log.push('promise update: ' + note); });
        $interval.flush(1000);

        expect(log).toEqual(['promise update: 0']);
      }));
    });


    describe('cancel', function() {
      it('should cancel tasks', inject(function($interval) {
        var task1 = jasmine.createSpy('task1', 1000),
            task2 = jasmine.createSpy('task2', 1000),
            task3 = jasmine.createSpy('task3', 1000),
            promise1, promise3;

        promise1 = $interval(task1, 200);
        $interval(task2, 1000);
        promise3 = $interval(task3, 333);

        $interval.cancel(promise3);
        $interval.cancel(promise1);
        $interval.flush(1000);

        expect(task1).not.toHaveBeenCalled();
        expect(task2).toHaveBeenCalledOnce();
        expect(task3).not.toHaveBeenCalled();
      }));


      it('should cancel the promise', inject(function($interval, $rootScope) {
        var promise = $interval(noop, 1000),
            log = [];
        promise.then(function(value) { log.push('promise success: ' + value); },
                   function(err) { log.push('promise error: ' + err); },
                   function(note) { log.push('promise update: ' + note); });
        expect(log).toEqual([]);

        $interval.flush(1000);
        $interval.cancel(promise);
        $interval.flush(1000);
        $rootScope.$apply(); // For resolving the promise -
                             // necessary since q uses $rootScope.evalAsync.

        expect(log).toEqual(['promise update: 0', 'promise error: canceled']);
      }));


      it('should return true if a task was successfully canceled', inject(function($interval) {
        var task1 = jasmine.createSpy('task1'),
            task2 = jasmine.createSpy('task2'),
            promise1, promise2;

        promise1 = $interval(task1, 1000, 1);
        $interval.flush(1000);
        promise2 = $interval(task2, 1000, 1);

        expect($interval.cancel(promise1)).toBe(false);
        expect($interval.cancel(promise2)).toBe(true);
      }));


      it('should not throw a runtime exception when given an undefined promise',
          inject(function($interval) {
        var task1 = jasmine.createSpy('task1'),
            promise1;

        promise1 = $interval(task1, 1000, 1);

        expect($interval.cancel()).toBe(false);
      }));
    });
  });


  describe('defer', function() {
    var browser, log;
    beforeEach(inject(function($browser) {
      browser = $browser;
      log = '';
    }));

    function logFn(text) {
      return function() {
        log += text + ';';
      };
    }

    it('should flush', function() {
      browser.defer(logFn('A'));
      expect(log).toEqual('');
      browser.defer.flush();
      expect(log).toEqual('A;');
    });

    it('should flush delayed', function() {
      browser.defer(logFn('A'));
      browser.defer(logFn('B'), 10);
      browser.defer(logFn('C'), 20);
      expect(log).toEqual('');

      expect(browser.defer.now).toEqual(0);
      browser.defer.flush(0);
      expect(log).toEqual('A;');

      browser.defer.flush();
      expect(log).toEqual('A;B;C;');
    });

    it('should defer and flush over time', function() {
      browser.defer(logFn('A'), 1);
      browser.defer(logFn('B'), 2);
      browser.defer(logFn('C'), 3);

      browser.defer.flush(0);
      expect(browser.defer.now).toEqual(0);
      expect(log).toEqual('');

      browser.defer.flush(1);
      expect(browser.defer.now).toEqual(1);
      expect(log).toEqual('A;');

      browser.defer.flush(2);
      expect(browser.defer.now).toEqual(3);
      expect(log).toEqual('A;B;C;');
    });

    it('should throw an exception if there is nothing to be flushed', function() {
      expect(function() {browser.defer.flush();}).toThrowError('No deferred tasks to be flushed');
    });
  });


  describe('$exceptionHandler', function() {
    it('should rethrow exceptions', inject(function($exceptionHandler) {
      expect(function() { $exceptionHandler('myException'); }).toThrow('myException');
    }));


    it('should log exceptions', function() {
      module(function($exceptionHandlerProvider) {
        $exceptionHandlerProvider.mode('log');
      });
      inject(function($exceptionHandler) {
        $exceptionHandler('MyError');
        expect($exceptionHandler.errors).toEqual(['MyError']);

        $exceptionHandler('MyError', 'comment');
        expect($exceptionHandler.errors[1]).toEqual(['MyError', 'comment']);
      });
    });

    it('should log and rethrow exceptions', function() {
      module(function($exceptionHandlerProvider) {
        $exceptionHandlerProvider.mode('rethrow');
      });
      inject(function($exceptionHandler) {
        expect(function() { $exceptionHandler('MyError'); }).toThrow('MyError');
        expect($exceptionHandler.errors).toEqual(['MyError']);

        expect(function() { $exceptionHandler('MyError', 'comment'); }).toThrow('MyError');
        expect($exceptionHandler.errors[1]).toEqual(['MyError', 'comment']);
      });
    });

    it('should throw on wrong argument', function() {
      module(function($exceptionHandlerProvider) {
        expect(function() {
          $exceptionHandlerProvider.mode('XXX');
        }).toThrowError('Unknown mode \'XXX\', only \'log\'/\'rethrow\' modes are allowed!');
      });

      inject(); // Trigger the tests in `module`
    });
  });


  describe('$timeout', function() {
    it('should expose flush method that will flush the pending queue of tasks', inject(
        function($timeout) {
      var logger = [],
          logFn = function(msg) { return function() { logger.push(msg); }; };

      $timeout(logFn('t1'));
      $timeout(logFn('t2'), 200);
      $timeout(logFn('t3'));
      expect(logger).toEqual([]);

      $timeout.flush();
      expect(logger).toEqual(['t1', 't3', 't2']);
    }));


    it('should throw an exception when not flushed', inject(function($timeout) {
      $timeout(noop);

      var expectedError = 'Deferred tasks to flush (1): {id: 0, time: 0}';
      expect(function() {$timeout.verifyNoPendingTasks();}).toThrowError(expectedError);
    }));


    it('should do nothing when all tasks have been flushed', inject(function($timeout) {
      $timeout(noop);

      $timeout.flush();
      expect(function() {$timeout.verifyNoPendingTasks();}).not.toThrow();
    }));


    it('should check against the delay if provided within timeout', inject(function($timeout) {
      $timeout(noop, 100);
      $timeout.flush(100);
      expect(function() {$timeout.verifyNoPendingTasks();}).not.toThrow();

      $timeout(noop, 1000);
      $timeout.flush(100);
      expect(function() {$timeout.verifyNoPendingTasks();}).toThrow();

      $timeout.flush(900);
      expect(function() {$timeout.verifyNoPendingTasks();}).not.toThrow();
    }));


    it('should assert against the delay value', inject(function($timeout) {
      var count = 0;
      var iterate = function() {
        count++;
      };

      $timeout(iterate, 100);
      $timeout(iterate, 123);
      $timeout.flush(100);
      expect(count).toBe(1);
      $timeout.flush(123);
      expect(count).toBe(2);
    }));

    it('should resolve timeout functions following the timeline', inject(function($timeout) {
      var count1 = 0, count2 = 0;
      var iterate1 = function() {
        count1++;
        $timeout(iterate1, 100);
      };
      var iterate2 = function() {
        count2++;
        $timeout(iterate2, 150);
      };

      $timeout(iterate1, 100);
      $timeout(iterate2, 150);
      $timeout.flush(150);
      expect(count1).toBe(1);
      expect(count2).toBe(1);
      $timeout.flush(50);
      expect(count1).toBe(2);
      expect(count2).toBe(1);
      $timeout.flush(400);
      expect(count1).toBe(6);
      expect(count2).toBe(4);
    }));
  });


  describe('angular.mock.dump', function() {
    var d = angular.mock.dump;


    it('should serialize primitive types', function() {
      expect(d(undefined)).toEqual('undefined');
      expect(d(1)).toEqual('1');
      expect(d(null)).toEqual('null');
      expect(d('abc')).toEqual('abc');
    });


    it('should serialize element', function() {
      var e = angular.element('<div>abc</div><span>xyz</span>');
      expect(d(e).toLowerCase()).toEqual('<div>abc</div><span>xyz</span>');
      expect(d(e[0]).toLowerCase()).toEqual('<div>abc</div>');
    });

    it('should serialize scope', inject(function($rootScope) {
      $rootScope.obj = {abc:'123'};
      expect(d($rootScope)).toMatch(/Scope\(.*\): \{/);
      expect(d($rootScope)).toMatch(/{"abc":"123"}/);
    }));

    it('should serialize scope that has overridden "hasOwnProperty"', inject(function($rootScope, $sniffer) {
      $rootScope.hasOwnProperty = 'X';
      expect(d($rootScope)).toMatch(/Scope\(.*\): \{/);
      expect(d($rootScope)).toMatch(/hasOwnProperty: "X"/);
    }));
  });


  describe('jasmine module and inject', function() {
    var log;

    beforeEach(function() {
      log = '';
    });

    describe('module', function() {

      describe('object literal format', function() {
        var mock = { log: 'module' };

        beforeEach(function() {
          module({
              'service': mock,
              'other': { some: 'replacement'}
            },
            'ngResource',
            function($provide) { $provide.value('example', 'win'); }
          );
        });

        it('should inject the mocked module', function() {
          inject(function(service) {
            expect(service).toEqual(mock);
          });
        });

        it('should support multiple key value pairs', function() {
          inject(function(service, other) {
            expect(other.some).toEqual('replacement');
            expect(service).toEqual(mock);
          });
        });

        it('should integrate with string and function', function() {
          inject(function(service, $resource, example) {
            expect(service).toEqual(mock);
            expect($resource).toBeDefined();
            expect(example).toEqual('win');
          });
        });

        describe('$inject cleanup', function() {
          function testFn() {

          }

          it('should add $inject when invoking test function', inject(function($injector) {
            $injector.invoke(testFn);
            expect(testFn.$inject).toBeDefined();
          }));

          it('should cleanup $inject after previous test', function() {
            expect(testFn.$inject).toBeUndefined();
          });

          it('should add $inject when annotating test function', inject(function($injector) {
            $injector.annotate(testFn);
            expect(testFn.$inject).toBeDefined();
          }));

          it('should cleanup $inject after previous test', function() {
            expect(testFn.$inject).toBeUndefined();
          });

          it('should invoke an already annotated function', inject(function($injector) {
            testFn.$inject = [];
            $injector.invoke(testFn);
          }));

          it('should not cleanup $inject after previous test', function() {
            expect(testFn.$inject).toBeDefined();
          });
        });
      });

      describe('in DSL', function() {
        it('should load module', module(function() {
          log += 'module';
        }));

        afterEach(function() {
          inject();
          expect(log).toEqual('module');
        });
      });

      describe('nested calls', function() {
        it('should invoke nested module calls immediately', function() {
          module(function($provide) {
            $provide.constant('someConst', 'blah');
            module(function(someConst) {
              log = someConst;
            });
          });
          inject(function() {
            expect(log).toBe('blah');
          });
        });
      });

      describe('inline in test', function() {
        it('should load module', function() {
          module(function() {
            log += 'module';
          });
          inject();
        });

        afterEach(function() {
          expect(log).toEqual('module');
        });
      });
    });

    describe('inject', function() {
      describe('in DSL', function() {
        it('should load module', inject(function() {
          log += 'inject';
        }));

        afterEach(function() {
          expect(log).toEqual('inject');
        });
      });


      describe('inline in test', function() {
        it('should load module', function() {
          inject(function() {
            log += 'inject';
          });
        });

        afterEach(function() {
          expect(log).toEqual('inject');
        });
      });

      describe('module with inject', function() {
        beforeEach(module(function() {
          log += 'module;';
        }));

        it('should inject', inject(function() {
          log += 'inject;';
        }));

        afterEach(function() {
          expect(log).toEqual('module;inject;');
        });
      });

      it('should not change thrown Errors', inject(function($sniffer) {
        expect(function() {
          inject(function() {
            throw new Error('test message');
          });
        }).toThrow(jasmine.objectContaining({message: 'test message'}));
      }));

      it('should not change thrown strings', inject(function($sniffer) {
        expect(function() {
          inject(function() {
            throw 'test message';
          });
        }).toThrow('test message');
      }));

      describe('error stack trace when called outside of spec context', function() {
        // - Chrome, Firefox, Edge give us the stack trace as soon as an Error is created
        // - IE10+, PhantomJS give us the stack trace only once the error is thrown
        // - IE9 does not provide stack traces
        var stackTraceSupported = (function() {
          var error = new Error();
          if (!error.stack) {
            try {
              throw error;
            } catch (e) { /* empty */}
          }

          return !!error.stack;
        })();

        function testCaller() {
          return inject(function() {
            throw new Error();
          });
        }
        var throwErrorFromInjectCallback = testCaller();

        if (stackTraceSupported) {
          describe('on browsers supporting stack traces', function() {
            it('should update thrown Error stack trace with inject call location', function() {
              try {
                throwErrorFromInjectCallback();
              } catch (e) {
                expect(e.stack).toMatch('testCaller');
              }
            });
          });
        } else {
          describe('on browsers not supporting stack traces', function() {
            it('should not add stack trace information to thrown Error', function() {
              try {
                throwErrorFromInjectCallback();
              } catch (e) {
                expect(e.stack).toBeUndefined();
              }
            });
          });
        }
      });

      describe('ErrorAddingDeclarationLocationStack', function() {
        it('should be caught by Jasmine\'s `toThrowError()`', function() {
          function throwErrorAddingDeclarationStack() {
            module(function($provide) {
              $provide.factory('badFactory', function() {
                throw new Error('BadFactoryError');
              });
            });

            inject(function(badFactory) {});
          }

          expect(throwErrorAddingDeclarationStack).toThrowError(/BadFactoryError/);
        });
      });
    });
  });


  describe('$httpBackend', function() {
    var hb, callback, realBackendSpy;

    beforeEach(inject(function($httpBackend) {
      callback = jasmine.createSpy('callback');
      hb = $httpBackend;
    }));


    it('should provide "expect" methods for each HTTP verb', function() {
      expect(typeof hb.expectGET).toBe('function');
      expect(typeof hb.expectPOST).toBe('function');
      expect(typeof hb.expectPUT).toBe('function');
      expect(typeof hb.expectPATCH).toBe('function');
      expect(typeof hb.expectDELETE).toBe('function');
      expect(typeof hb.expectHEAD).toBe('function');
    });


    it('should provide "when" methods for each HTTP verb', function() {
      expect(typeof hb.whenGET).toBe('function');
      expect(typeof hb.whenPOST).toBe('function');
      expect(typeof hb.whenPUT).toBe('function');
      expect(typeof hb.whenPATCH).toBe('function');
      expect(typeof hb.whenDELETE).toBe('function');
      expect(typeof hb.whenHEAD).toBe('function');
    });


    it('should provide "route" shortcuts for expect and when', function() {
      expect(typeof hb.whenRoute).toBe('function');
      expect(typeof hb.expectRoute).toBe('function');
    });


    it('should respond with first matched definition', function() {
      hb.when('GET', '/url1').respond(200, 'content', {});
      hb.when('GET', '/url1').respond(201, 'another', {});

      callback.and.callFake(function(status, response) {
        expect(status).toBe(200);
        expect(response).toBe('content');
      });

      hb('GET', '/url1', null, callback);
      expect(callback).not.toHaveBeenCalled();
      hb.flush();
      expect(callback).toHaveBeenCalledOnce();
    });


    it('should respond with a copy of the mock data', function() {
      var mockObject = {a: 'b'};

      hb.when('GET', '/url1').respond(200, mockObject, {});

      callback.and.callFake(function(status, response) {
        expect(status).toBe(200);
        expect(response).toEqual({a: 'b'});
        expect(response).not.toBe(mockObject);
        response.a = 'c';
      });

      hb('GET', '/url1', null, callback);
      hb.flush();
      expect(callback).toHaveBeenCalledOnce();

      // Fire it again and verify that the returned mock data has not been
      // modified.
      callback.calls.reset();
      hb('GET', '/url1', null, callback);
      hb.flush();
      expect(callback).toHaveBeenCalledOnce();
      expect(mockObject).toEqual({a: 'b'});
    });


    it('should be able to handle Blobs as mock data', function() {
      if (typeof Blob !== 'undefined') {
        // eslint-disable-next-line no-undef
        var mockBlob = new Blob(['{"foo":"bar"}'], {type: 'application/json'});

        hb.when('GET', '/url1').respond(200, mockBlob, {});

        callback.and.callFake(function(status, response) {
          expect(response).not.toBe(mockBlob);
          expect(response.size).toBe(13);
          expect(response.type).toBe('application/json');
          expect(response.toString()).toBe('[object Blob]');
        });

        hb('GET', '/url1', null, callback);
        hb.flush();
        expect(callback).toHaveBeenCalledOnce();
      }
    });


    it('should throw error when unexpected request', function() {
      hb.when('GET', '/url1').respond(200, 'content');
      expect(function() {
        hb('GET', '/xxx');
      }).toThrowError('Unexpected request: GET /xxx\nNo more request expected');
    });


    it('should match headers if specified', function() {
      hb.when('GET', '/url', null, {'X': 'val1'}).respond(201, 'content1');
      hb.when('GET', '/url', null, {'X': 'val2'}).respond(202, 'content2');
      hb.when('GET', '/url').respond(203, 'content3');

      hb('GET', '/url', null, function(status, response) {
        expect(status).toBe(203);
        expect(response).toBe('content3');
      });

      hb('GET', '/url', null, function(status, response) {
        expect(status).toBe(201);
        expect(response).toBe('content1');
      }, {'X': 'val1'});

      hb('GET', '/url', null, function(status, response) {
        expect(status).toBe(202);
        expect(response).toBe('content2');
      }, {'X': 'val2'});

      hb.flush();
    });


    it('should match data if specified', function() {
      hb.when('GET', '/a/b', '{a: true}').respond(201, 'content1');
      hb.when('GET', '/a/b').respond(202, 'content2');

      hb('GET', '/a/b', '{a: true}', function(status, response) {
        expect(status).toBe(201);
        expect(response).toBe('content1');
      });

      hb('GET', '/a/b', null, function(status, response) {
        expect(status).toBe(202);
        expect(response).toBe('content2');
      });

      hb.flush();
    });


    it('should match data object if specified', function() {
      hb.when('GET', '/a/b', {a: 1, b: 2}).respond(201, 'content1');
      hb.when('GET', '/a/b').respond(202, 'content2');

      hb('GET', '/a/b', '{"a":1,"b":2}', function(status, response) {
        expect(status).toBe(201);
        expect(response).toBe('content1');
      });

      hb('GET', '/a/b', '{"b":2,"a":1}', function(status, response) {
        expect(status).toBe(201);
        expect(response).toBe('content1');
      });

      hb('GET', '/a/b', null, function(status, response) {
        expect(status).toBe(202);
        expect(response).toBe('content2');
      });

      hb.flush();
    });


    it('should match only method', function() {
      hb.when('GET').respond(202, 'c');
      callback.and.callFake(function(status, response) {
        expect(status).toBe(202);
        expect(response).toBe('c');
      });

      hb('GET', '/some', null, callback, {});
      hb('GET', '/another', null, callback, {'X-Fake': 'Header'});
      hb('GET', '/third', 'some-data', callback, {});
      hb.flush();

      expect(callback).toHaveBeenCalled();
    });


    it('should not error if the url is not provided', function() {
      expect(function() {
        hb.when('GET');

        hb.whenGET();
        hb.whenPOST();
        hb.whenPUT();
        hb.whenPATCH();
        hb.whenDELETE();
        hb.whenHEAD();

        hb.expect('GET');

        hb.expectGET();
        hb.expectPOST();
        hb.expectPUT();
        hb.expectPATCH();
        hb.expectDELETE();
        hb.expectHEAD();
      }).not.toThrow();
    });


    it('should error if the url is undefined', function() {
      expect(function() {
        hb.when('GET', undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenGET(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenDELETE(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenJSONP(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenHEAD(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenPATCH(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenPOST(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.whenPUT(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');


      expect(function() {
        hb.expect('GET', undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectGET(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectDELETE(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectJSONP(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectHEAD(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectPATCH(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectPOST(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');

      expect(function() {
        hb.expectPUT(undefined);
      }).toThrowError('Undefined argument `url`; the argument is provided but not defined');
    });


    it('should preserve the order of requests', function() {
      hb.when('GET', '/url1').respond(200, 'first');
      hb.when('GET', '/url2').respond(201, 'second');

      hb('GET', '/url2', null, callback);
      hb('GET', '/url1', null, callback);

      hb.flush();

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.calls.argsFor(0)).toEqual([201, 'second', '', '', 'complete']);
      expect(callback.calls.argsFor(1)).toEqual([200, 'first', '', '', 'complete']);
    });


    describe('respond()', function() {
      it('should take values', function() {
        hb.expect('GET', '/url1').respond(200, 'first', {'header': 'val'}, 'OK');
        hb('GET', '/url1', undefined, callback);
        hb.flush();

        expect(callback).toHaveBeenCalledOnceWith(200, 'first', 'header: val', 'OK', 'complete');
      });

      it('should default status code to 200', function() {
        callback.and.callFake(function(status, response) {
          expect(status).toBe(200);
          expect(response).toBe('some-data');
        });

        hb.expect('GET', '/url1').respond('some-data');
        hb.expect('GET', '/url2').respond('some-data', {'X-Header': 'true'});
        hb('GET', '/url1', null, callback);
        hb('GET', '/url2', null, callback);
        hb.flush();
        expect(callback).toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(2);
      });

      it('should default status code to 200 and provide status text', function() {
        hb.expect('GET', '/url1').respond('first', {'header': 'val'}, 'OK');
        hb('GET', '/url1', null, callback);
        hb.flush();

        expect(callback).toHaveBeenCalledOnceWith(200, 'first', 'header: val', 'OK', 'complete');
      });

      it('should default xhrStatus to complete', function() {
        callback.and.callFake(function(status, response, headers, x, xhrStatus) {
          expect(xhrStatus).toBe('complete');
        });

        hb.expect('GET', '/url1').respond('some-data');
        hb('GET', '/url1', null, callback);

        hb.flush();
        expect(callback).toHaveBeenCalled();
      });

      it('should take function', function() {
        hb.expect('GET', '/some?q=s').respond(function(m, u, d, h, p) {
          return [301, m + u + ';' + d + ';a=' + h.a + ';q=' + p.q, {'Connection': 'keep-alive'}, 'Moved Permanently'];
        });

        hb('GET', '/some?q=s', 'data', callback, {a: 'b'});
        hb.flush();

        expect(callback).toHaveBeenCalledOnceWith(301, 'GET/some?q=s;data;a=b;q=s', 'Connection: keep-alive', 'Moved Permanently', undefined);
      });

      it('should decode query parameters in respond() function', function() {
        hb.expect('GET', '/url?query=l%E2%80%A2ng%20string%20w%2F%20spec%5Eal%20char%24&id=1234&orderBy=-name')
        .respond(function(m, u, d, h, p) {
          return [200, 'id=' + p.id + ';orderBy=' + p.orderBy + ';query=' + p.query];
        });

        hb('GET', '/url?query=l%E2%80%A2ng%20string%20w%2F%20spec%5Eal%20char%24&id=1234&orderBy=-name', null, callback);
        hb.flush();

        expect(callback).toHaveBeenCalledOnceWith(200, 'id=1234;orderBy=-name;query=l•ng string w/ spec^al char$', '', '', undefined);
      });

      it('should include regex captures in respond() params when keys provided', function() {
        hb.expect('GET', /\/(.+)\/article\/(.+)/, undefined, undefined, ['id', 'name'])
        .respond(function(m, u, d, h, p) {
          return [200, 'id=' + p.id + ';name=' + p.name];
        });

        hb('GET', '/1234/article/cool-angular-article', null, callback);
        hb.flush();

        expect(callback).toHaveBeenCalledOnceWith(200, 'id=1234;name=cool-angular-article', '', '', undefined);
      });

      it('should default response headers to ""', function() {
        hb.expect('GET', '/url1').respond(200, 'first');
        hb.expect('GET', '/url2').respond('second');

        hb('GET', '/url1', null, callback);
        hb('GET', '/url2', null, callback);

        hb.flush();

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback.calls.argsFor(0)).toEqual([200, 'first', '', '', 'complete']);
        expect(callback.calls.argsFor(1)).toEqual([200, 'second', '', '', 'complete']);
      });

      it('should be able to override response of expect definition', function() {
        var definition = hb.expect('GET', '/url1');
        definition.respond('first');
        definition.respond('second');

        hb('GET', '/url1', null, callback);
        hb.flush();
        expect(callback).toHaveBeenCalledOnceWith(200, 'second', '', '', 'complete');
      });

      it('should be able to override response of when definition', function() {
        var definition = hb.when('GET', '/url1');
        definition.respond('first');
        definition.respond('second');

        hb('GET', '/url1', null, callback);
        hb.flush();
        expect(callback).toHaveBeenCalledOnceWith(200, 'second', '', '', 'complete');
      });

      it('should be able to override response of expect definition with chaining', function() {
        var definition = hb.expect('GET', '/url1').respond('first');
        definition.respond('second');

        hb('GET', '/url1', null, callback);
        hb.flush();
        expect(callback).toHaveBeenCalledOnceWith(200, 'second', '', '', 'complete');
      });

      it('should be able to override response of when definition with chaining', function() {
        var definition = hb.when('GET', '/url1').respond('first');
        definition.respond('second');

        hb('GET', '/url1', null, callback);
        hb.flush();
        expect(callback).toHaveBeenCalledOnceWith(200, 'second', '', '', 'complete');
      });
    });


    describe('expect()', function() {
      it('should require specified order', function() {
        hb.expect('GET', '/url1').respond(200, '');
        hb.expect('GET', '/url2').respond(200, '');

        expect(function() {
          hb('GET', '/url2', null, noop, {});
        }).toThrowError('Unexpected request: GET /url2\nExpected GET /url1');
      });


      it('should have precedence over when()', function() {
        callback.and.callFake(function(status, response) {
          expect(status).toBe(300);
          expect(response).toBe('expect');
        });

        hb.when('GET', '/url').respond(200, 'when');
        hb.expect('GET', '/url').respond(300, 'expect');

        hb('GET', '/url', null, callback, {});
        hb.flush();
        expect(callback).toHaveBeenCalledOnce();
      });


      it('should throw exception when only headers differs from expectation', function() {
        hb.when('GET').respond(200, '', {});
        hb.expect('GET', '/match', undefined, {'Content-Type': 'application/json'});

        expect(function() {
          hb('GET', '/match', null, noop, {});
        }).toThrowError('Expected GET /match with different headers\n' +
                        'EXPECTED: {"Content-Type":"application/json"}\nGOT:      {}');
      });


      it('should throw exception when only data differs from expectation', function() {
        hb.when('GET').respond(200, '', {});
        hb.expect('GET', '/match', 'some-data');

        expect(function() {
          hb('GET', '/match', 'different', noop, {});
        }).toThrowError('Expected GET /match with different data\n' +
                        'EXPECTED: some-data\nGOT:      different');
      });


      it('should not throw an exception when parsed body is equal to expected body object', function() {
        hb.when('GET').respond(200, '', {});

        hb.expect('GET', '/match', {a: 1, b: 2});
        expect(function() {
          hb('GET', '/match', '{"a":1,"b":2}', noop, {});
        }).not.toThrow();

        hb.expect('GET', '/match', {a: 1, b: 2});
        expect(function() {
          hb('GET', '/match', '{"b":2,"a":1}', noop, {});
        }).not.toThrow();
      });


      it('should throw exception when only parsed body differs from expected body object', function() {
        hb.when('GET').respond(200, '', {});
        hb.expect('GET', '/match', {a: 1, b: 2});

        expect(function() {
          hb('GET', '/match', '{"a":1,"b":3}', noop, {});
        }).toThrowError('Expected GET /match with different data\n' +
                        'EXPECTED: {"a":1,"b":2}\nGOT:      {"a":1,"b":3}');
      });


      it('should use when\'s respond() when no expect() respond is defined', function() {
        callback.and.callFake(function(status, response) {
          expect(status).toBe(201);
          expect(response).toBe('data');
        });

        hb.when('GET', '/some').respond(201, 'data');
        hb.expect('GET', '/some');
        hb('GET', '/some', null, callback);
        hb.flush();

        expect(callback).toHaveBeenCalled();
        expect(function() { hb.verifyNoOutstandingExpectation(); }).not.toThrow();
      });
    });


    describe('flush()', function() {
      it('flush() should flush requests fired during callbacks', function() {
        hb.when('GET').respond(200, '');
        hb('GET', '/some', null, function() {
          hb('GET', '/other', null, callback);
        });

        hb.flush();
        expect(callback).toHaveBeenCalled();
      });


      it('should flush given number of pending requests', function() {
        hb.when('GET').respond(200, '');
        hb('GET', '/some', null, callback);
        hb('GET', '/some', null, callback);
        hb('GET', '/some', null, callback);

        hb.flush(2);
        expect(callback).toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(2);
      });


      it('should flush given number of pending requests beginning at specified request', function() {
        var dontCallMe = jasmine.createSpy('dontCallMe');

        hb.when('GET').respond(200, '');
        hb('GET', '/some', null, dontCallMe);
        hb('GET', '/some', null, callback);
        hb('GET', '/some', null, callback);
        hb('GET', '/some', null, dontCallMe);

        hb.flush(2, 1);
        expect(dontCallMe).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(2);
      });


      it('should flush all pending requests beginning at specified request', function() {
        var dontCallMe = jasmine.createSpy('dontCallMe');

        hb.when('GET').respond(200, '');
        hb('GET', '/some', null, dontCallMe);
        hb('GET', '/some', null, dontCallMe);
        hb('GET', '/some', null, callback);
        hb('GET', '/some', null, callback);

        hb.flush(null, 2);
        expect(dontCallMe).not.toHaveBeenCalled();
        expect(callback).toHaveBeenCalledTimes(2);
      });


      it('should throw exception when flushing more requests than pending', function() {
        hb.when('GET').respond(200, '');
        hb('GET', '/url', null, callback);

        expect(function() {hb.flush(2);}).toThrowError('No more pending request to flush !');
        expect(callback).toHaveBeenCalledOnce();
      });


      it('should throw exception when no request to flush', function() {
        expect(function() {hb.flush();}).toThrowError('No pending request to flush !');

        hb.when('GET').respond(200, '');
        hb('GET', '/some', null, callback);
        expect(function() {hb.flush(null, 1);}).toThrowError('No pending request to flush !');

        hb.flush();
        expect(function() {hb.flush();}).toThrowError('No pending request to flush !');
      });


      it('should throw exception if not all expectations satisfied', function() {
        hb.expect('GET', '/url1').respond();
        hb.expect('GET', '/url2').respond();

        hb('GET', '/url1', null, angular.noop);
        expect(function() {hb.flush();}).toThrowError('Unsatisfied requests: GET /url2');
      });
    });


    it('should abort requests when timeout promise resolves', function() {
      hb.expect('GET', '/url1').respond(200);

      var canceler, then = jasmine.createSpy('then').and.callFake(function(fn) {
        canceler = fn;
      });

      hb('GET', '/url1', null, callback, null, {then: then});
      expect(typeof canceler).toBe('function');

      canceler();  // simulate promise resolution

      expect(callback).toHaveBeenCalledWith(-1, undefined, '', undefined, 'timeout');
      hb.verifyNoOutstandingExpectation();
      hb.verifyNoOutstandingRequest();
    });


    it('should abort requests when timeout passed as a numeric value', inject(function($timeout) {
      hb.expect('GET', '/url1').respond(200);

      hb('GET', '/url1', null, callback, null, 200);
      $timeout.flush(300);

      expect(callback).toHaveBeenCalledWith(-1, undefined, '', undefined, 'timeout');
      hb.verifyNoOutstandingExpectation();
      hb.verifyNoOutstandingRequest();
    }));


    it('should throw an exception if no response defined', function() {
      hb.when('GET', '/test');
      expect(function() {
        hb('GET', '/test', null, callback);
      }).toThrowError('No response defined !');
    });


    it('should throw an exception if no response for exception and no definition', function() {
      hb.expect('GET', '/url');
      expect(function() {
        hb('GET', '/url', null, callback);
      }).toThrowError('No response defined !');
    });


    it('should respond undefined when JSONP method', function() {
      hb.when('JSONP', '/url1').respond(200);
      hb.expect('JSONP', '/url2').respond(200);

      expect(hb('JSONP', '/url1')).toBeUndefined();
      expect(hb('JSONP', '/url2')).toBeUndefined();
    });


    it('should not have passThrough method', function() {
      expect(hb.passThrough).toBeUndefined();
    });


    describe('verifyExpectations', function() {

      it('should throw exception if not all expectations were satisfied', function() {
        hb.expect('POST', '/u1', 'ddd').respond(201, '', {});
        hb.expect('GET', '/u2').respond(200, '', {});
        hb.expect('POST', '/u3').respond(201, '', {});

        hb('POST', '/u1', 'ddd', noop, {});

        expect(function() {hb.verifyNoOutstandingExpectation();}).
          toThrowError('Unsatisfied requests: GET /u2, POST /u3');
      });


      it('should do nothing when no expectation', function() {
        hb.when('DELETE', '/some').respond(200, '');

        expect(function() {hb.verifyNoOutstandingExpectation();}).not.toThrow();
      });


      it('should do nothing when all expectations satisfied', function() {
        hb.expect('GET', '/u2').respond(200, '', {});
        hb.expect('POST', '/u3').respond(201, '', {});
        hb.when('DELETE', '/some').respond(200, '');

        hb('GET', '/u2', noop);
        hb('POST', '/u3', noop);

        expect(function() {hb.verifyNoOutstandingExpectation();}).not.toThrow();
      });
    });


    describe('verifyRequests', function() {

      it('should throw exception if not all requests were flushed', function() {
        hb.when('GET').respond(200);
        hb('GET', '/some', null, noop, {});

        expect(function() {
          hb.verifyNoOutstandingRequest();
        }).toThrowError('Unflushed requests: 1\n' +
                        '  GET /some');
      });


      it('should verify requests fired asynchronously', inject(function($q) {
        hb.when('GET').respond(200);
        $q.resolve().then(function() {
          hb('GET', '/some', null, noop, {});
        });

        expect(function() {
          hb.verifyNoOutstandingRequest();
        }).toThrowError('Unflushed requests: 1\n' +
                        '  GET /some');
      }));


      it('should describe multiple unflushed requests', function() {
        hb.when('GET').respond(200);
        hb.when('PUT').respond(200);
        hb('GET', '/some', null, noop, {});
        hb('PUT', '/elsewhere', null, noop, {});

        expect(function() {
          hb.verifyNoOutstandingRequest();
        }).toThrowError('Unflushed requests: 2\n' +
                        '  GET /some\n' +
                        '  PUT /elsewhere');
      });
    });


    describe('resetExpectations', function() {

      it('should remove all expectations', function() {
        hb.expect('GET', '/u2').respond(200, '', {});
        hb.expect('POST', '/u3').respond(201, '', {});
        hb.resetExpectations();

        expect(function() {hb.verifyNoOutstandingExpectation();}).not.toThrow();
      });


      it('should remove all pending responses', function() {
        var cancelledClb = jasmine.createSpy('cancelled');

        hb.expect('GET', '/url').respond(200, '');
        hb('GET', '/url', null, cancelledClb);
        hb.resetExpectations();

        hb.expect('GET', '/url').respond(300, '');
        hb('GET', '/url', null, callback, {});
        hb.flush();

        expect(callback).toHaveBeenCalledOnce();
        expect(cancelledClb).not.toHaveBeenCalled();
      });


      it('should not remove definitions', function() {
        var cancelledClb = jasmine.createSpy('cancelled');

        hb.when('GET', '/url').respond(200, 'success');
        hb('GET', '/url', null, cancelledClb);
        hb.resetExpectations();

        hb('GET', '/url', null, callback, {});
        hb.flush();

        expect(callback).toHaveBeenCalledOnce();
        expect(cancelledClb).not.toHaveBeenCalled();
      });
    });


    describe('expect/when shortcuts', function() {
      angular.forEach(['expect', 'when'], function(prefix) {
        angular.forEach(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'JSONP'], function(method) {
          var shortcut = prefix + method;
          it('should provide ' + shortcut + ' shortcut method', function() {
            hb[shortcut]('/foo').respond('bar');
            hb(method, '/foo', undefined, callback);
            hb.flush();
            expect(callback).toHaveBeenCalledOnceWith(200, 'bar', '', '', 'complete');
          });
        });
      });
    });


    describe('expectRoute/whenRoute shortcuts', function() {
      angular.forEach(['expectRoute', 'whenRoute'], function(routeShortcut) {
        var methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'JSONP'];
        they('should provide ' + routeShortcut + ' shortcut with $prop method', methods,
          function() {
            hb[routeShortcut](this, '/route').respond('path');
            hb(this, '/route', undefined, callback);
            hb.flush();
            expect(callback).toHaveBeenCalledOnceWith(200, 'path', '', '', 'complete');
          }
        );
        they('should match colon delimited parameters in ' + routeShortcut + ' $prop method', methods,
          function() {
            hb[routeShortcut](this, '/route/:id/path/:s_id').respond('path');
            hb(this, '/route/123/path/456', undefined, callback);
            hb.flush();
            expect(callback).toHaveBeenCalledOnceWith(200, 'path', '', '', 'complete');
          }
        );
        they('should ignore query param when matching in ' + routeShortcut + ' $prop method', methods,
          function() {
            hb[routeShortcut](this, '/route/:id').respond('path');
            hb(this, '/route/123?q=str&foo=bar', undefined, callback);
            hb.flush();
            expect(callback).toHaveBeenCalledOnceWith(200, 'path', '', '', 'complete');
          }
        );
      });
    });


    describe('MockHttpExpectation', function() {
      /* global MockHttpExpectation */

      it('should accept url as regexp', function() {
        var exp = new MockHttpExpectation('GET', /^\/x/);

        expect(exp.match('GET', '/x')).toBe(true);
        expect(exp.match('GET', '/xxx/x')).toBe(true);
        expect(exp.match('GET', 'x')).toBe(false);
        expect(exp.match('GET', 'a/x')).toBe(false);
      });

      it('should match url with same query params, but different order', function() {
        var exp = new MockHttpExpectation('GET', 'www.example.com/x/y?a=b&c=d&e=f');

        expect(exp.matchUrl('www.example.com/x/y?e=f&c=d&a=b')).toBe(true);
      });

      it('should accept url as function', function() {
        var urlValidator = function(url) {
          return url !== '/not-accepted';
        };
        var exp = new MockHttpExpectation('POST', urlValidator);

        expect(exp.match('POST', '/url')).toBe(true);
        expect(exp.match('POST', '/not-accepted')).toBe(false);
      });


      it('should accept data as regexp', function() {
        var exp = new MockHttpExpectation('POST', '/url', /\{.*?\}/);

        expect(exp.match('POST', '/url', '{"a": "aa"}')).toBe(true);
        expect(exp.match('POST', '/url', '{"one": "two"}')).toBe(true);
        expect(exp.match('POST', '/url', '{"one"')).toBe(false);
      });


      it('should accept data as function', function() {
        var dataValidator = function(data) {
          var json = angular.fromJson(data);
          return !!json.id && json.status === 'N';
        };
        var exp = new MockHttpExpectation('POST', '/url', dataValidator);

        expect(exp.matchData({})).toBe(false);
        expect(exp.match('POST', '/url', '{"id": "xxx", "status": "N"}')).toBe(true);
        expect(exp.match('POST', '/url', {'id': 'xxx', 'status': 'N'})).toBe(true);
      });


      it('should ignore data only if undefined (not null or false)', function() {
        var exp = new MockHttpExpectation('POST', '/url', null);
        expect(exp.matchData(null)).toBe(true);
        expect(exp.matchData('some-data')).toBe(false);

        exp = new MockHttpExpectation('POST', '/url', undefined);
        expect(exp.matchData(null)).toBe(true);
        expect(exp.matchData('some-data')).toBe(true);
      });


      it('should accept headers as function', function() {
        var exp = new MockHttpExpectation('GET', '/url', undefined, function(h) {
          return h['Content-Type'] === 'application/json';
        });

        expect(exp.matchHeaders({})).toBe(false);
        expect(exp.matchHeaders({'Content-Type': 'application/json', 'X-Another': 'true'})).toBe(true);
      });
    });
  });


  describe('$rootElement', function() {
    it('should create mock application root', inject(function($rootElement) {
      expect($rootElement.text()).toEqual('');
    }));

    it('should attach the `$injector` to `$rootElement`', inject(function($injector, $rootElement) {
      expect($rootElement.injector()).toBe($injector);
    }));
  });


  describe('$rootScopeDecorator', function() {

    describe('$countChildScopes', function() {

      it('should return 0 when no child scopes', inject(function($rootScope) {
        expect($rootScope.$countChildScopes()).toBe(0);

        var childScope = $rootScope.$new();
        expect($rootScope.$countChildScopes()).toBe(1);
        expect(childScope.$countChildScopes()).toBe(0);

        var grandChildScope = childScope.$new();
        expect(childScope.$countChildScopes()).toBe(1);
        expect(grandChildScope.$countChildScopes()).toBe(0);
      }));


      it('should correctly navigate complex scope tree', inject(function($rootScope) {
        var child;

        $rootScope.$new();
        $rootScope.$new().$new().$new();
        child = $rootScope.$new().$new();
        child.$new();
        child.$new();
        child.$new().$new().$new();

        expect($rootScope.$countChildScopes()).toBe(11);
      }));


      it('should provide the current count even after child destructions', inject(function($rootScope) {
        expect($rootScope.$countChildScopes()).toBe(0);

        var childScope1 = $rootScope.$new();
        expect($rootScope.$countChildScopes()).toBe(1);

        var childScope2 = $rootScope.$new();
        expect($rootScope.$countChildScopes()).toBe(2);

        childScope1.$destroy();
        expect($rootScope.$countChildScopes()).toBe(1);

        childScope2.$destroy();
        expect($rootScope.$countChildScopes()).toBe(0);
      }));


      it('should work with isolate scopes', inject(function($rootScope) {
        /*
                  RS
                  |
                 CIS
                /   \
              GCS   GCIS
         */

        var childIsolateScope = $rootScope.$new(true);
        expect($rootScope.$countChildScopes()).toBe(1);

        var grandChildScope = childIsolateScope.$new();
        expect($rootScope.$countChildScopes()).toBe(2);
        expect(childIsolateScope.$countChildScopes()).toBe(1);

        var grandChildIsolateScope = childIsolateScope.$new(true);
        expect($rootScope.$countChildScopes()).toBe(3);
        expect(childIsolateScope.$countChildScopes()).toBe(2);

        childIsolateScope.$destroy();
        expect($rootScope.$countChildScopes()).toBe(0);
      }));
    });


    describe('$countWatchers', function() {

      it('should return the sum of watchers for the current scope and all of its children', inject(
        function($rootScope) {

          expect($rootScope.$countWatchers()).toBe(0);

          var childScope = $rootScope.$new();
          expect($rootScope.$countWatchers()).toBe(0);

          childScope.$watch('foo');
          expect($rootScope.$countWatchers()).toBe(1);
          expect(childScope.$countWatchers()).toBe(1);

          $rootScope.$watch('bar');
          childScope.$watch('baz');
          expect($rootScope.$countWatchers()).toBe(3);
          expect(childScope.$countWatchers()).toBe(2);
      }));


      it('should correctly navigate complex scope tree', inject(function($rootScope) {
        var child;

        $rootScope.$watch('foo1');

        $rootScope.$new();
        $rootScope.$new().$new().$new();

        child = $rootScope.$new().$new();
        child.$watch('foo2');
        child.$new();
        child.$new();
        child = child.$new().$new().$new();
        child.$watch('foo3');
        child.$watch('foo4');

        expect($rootScope.$countWatchers()).toBe(4);
      }));


      it('should provide the current count even after child destruction and watch deregistration',
          inject(function($rootScope) {

        var deregisterWatch1 = $rootScope.$watch('exp1');

        var childScope = $rootScope.$new();
        childScope.$watch('exp2');

        expect($rootScope.$countWatchers()).toBe(2);

        childScope.$destroy();
        expect($rootScope.$countWatchers()).toBe(1);

        deregisterWatch1();
        expect($rootScope.$countWatchers()).toBe(0);
      }));


      it('should work with isolate scopes', inject(function($rootScope) {
        /*
                 RS=1
                   |
                CIS=1
                /    \
            GCS=1  GCIS=1
         */

        $rootScope.$watch('exp1');
        expect($rootScope.$countWatchers()).toBe(1);

        var childIsolateScope = $rootScope.$new(true);
        childIsolateScope.$watch('exp2');
        expect($rootScope.$countWatchers()).toBe(2);
        expect(childIsolateScope.$countWatchers()).toBe(1);

        var grandChildScope = childIsolateScope.$new();
        grandChildScope.$watch('exp3');

        var grandChildIsolateScope = childIsolateScope.$new(true);
        grandChildIsolateScope.$watch('exp4');

        expect($rootScope.$countWatchers()).toBe(4);
        expect(childIsolateScope.$countWatchers()).toBe(3);
        expect(grandChildScope.$countWatchers()).toBe(1);
        expect(grandChildIsolateScope.$countWatchers()).toBe(1);

        childIsolateScope.$destroy();
        expect($rootScope.$countWatchers()).toBe(1);
      }));
    });
  });


  describe('$controllerDecorator', function() {

    it('should support creating controller with bindings', function() {
      var called = false;
      var data = [
        { name: 'derp1', id: 0 },
        { name: 'testname', id: 1 },
        { name: 'flurp', id: 2 }
      ];
      module(function($controllerProvider) {
        $controllerProvider.register('testCtrl', function() {
          expect(this.data).toBeUndefined();
          called = true;
        });
      });
      inject(function($controller, $rootScope) {
        var ctrl = $controller('testCtrl', { scope: $rootScope }, { data: data });
        expect(ctrl.data).toBe(data);
        expect(called).toBe(true);
      });
    });


    it('should support assigning bindings when a value is returned from the constructor',
      function() {
        var called = false;
        var data = [
          { name: 'derp1', id: 0 },
          { name: 'testname', id: 1 },
          { name: 'flurp', id: 2 }
        ];
        module(function($controllerProvider) {
          $controllerProvider.register('testCtrl', function() {
            expect(this.data).toBeUndefined();
            called = true;
            return {};
          });
        });
        inject(function($controller, $rootScope) {
          var ctrl = $controller('testCtrl', { scope: $rootScope }, { data: data });
          expect(ctrl.data).toBe(data);
          expect(called).toBe(true);
        });
      }
    );


    if (support.classes) {
      it('should support assigning bindings to class-based controller', function() {
        var called = false;
        var data = [
          { name: 'derp1', id: 0 },
          { name: 'testname', id: 1 },
          { name: 'flurp', id: 2 }
        ];
        module(function($controllerProvider) {
          // eslint-disable-next-line no-eval
          var TestCtrl = eval('(class { constructor() { called = true; } })');
          $controllerProvider.register('testCtrl', TestCtrl);
        });
        inject(function($controller, $rootScope) {
          var ctrl = $controller('testCtrl', { scope: $rootScope }, { data: data });
          expect(ctrl.data).toBe(data);
          expect(called).toBe(true);
        });
      });
    }
  });


  describe('$componentController', function() {
    it('should instantiate a simple controller defined inline in a component', function() {
      function TestController($scope, a, b) {
        this.$scope = $scope;
        this.a = a;
        this.b = b;
      }
      module(function($compileProvider) {
        $compileProvider.component('test', {
          controller: TestController
        });
      });
      inject(function($componentController, $rootScope) {
        var $scope = {};
        var ctrl = $componentController('test', { $scope: $scope, a: 'A', b: 'B' }, { x: 'X', y: 'Y' });
        expect(ctrl).toEqual(extend(new TestController($scope, 'A', 'B'), { x: 'X', y: 'Y' }));
        expect($scope.$ctrl).toBe(ctrl);
      });
    });

    it('should instantiate a controller with $$inject annotation defined inline in a component', function() {
      function TestController(x, y, z) {
        this.$scope = x;
        this.a = y;
        this.b = z;
      }
      TestController.$inject = ['$scope', 'a', 'b'];
      module(function($compileProvider) {
        $compileProvider.component('test', {
          controller: TestController
        });
      });
      inject(function($componentController, $rootScope) {
        var $scope = {};
        var ctrl = $componentController('test', { $scope: $scope, a: 'A', b: 'B' }, { x: 'X', y: 'Y' });
        expect(ctrl).toEqual(extend(new TestController($scope, 'A', 'B'), { x: 'X', y: 'Y' }));
        expect($scope.$ctrl).toBe(ctrl);
      });
    });

    it('should instantiate a named controller defined in a component', function() {
      function TestController($scope, a, b) {
        this.$scope = $scope;
        this.a = a;
        this.b = b;
      }
      module(function($controllerProvider, $compileProvider) {
        $controllerProvider.register('TestController', TestController);
        $compileProvider.component('test', {
          controller: 'TestController'
        });
      });
      inject(function($componentController, $rootScope) {
        var $scope = {};
        var ctrl = $componentController('test', { $scope: $scope, a: 'A', b: 'B' }, { x: 'X', y: 'Y' });
        expect(ctrl).toEqual(extend(new TestController($scope, 'A', 'B'), { x: 'X', y: 'Y' }));
        expect($scope.$ctrl).toBe(ctrl);
      });
    });

    it('should instantiate a named controller with `controller as` syntax defined in a component', function() {
      function TestController($scope, a, b) {
        this.$scope = $scope;
        this.a = a;
        this.b = b;
      }
      module(function($controllerProvider, $compileProvider) {
        $controllerProvider.register('TestController', TestController);
        $compileProvider.component('test', {
          controller: 'TestController as testCtrl'
        });
      });
      inject(function($componentController, $rootScope) {
        var $scope = {};
        var ctrl = $componentController('test', { $scope: $scope, a: 'A', b: 'B' }, { x: 'X', y: 'Y' });
        expect(ctrl).toEqual(extend(new TestController($scope, 'A', 'B'), {x: 'X', y: 'Y'}));
        expect($scope.testCtrl).toBe(ctrl);
      });
    });

    it('should instantiate the controller of the restrict:\'E\' component if there are more directives with the same name but not restricted to \'E\'', function() {
      function TestController() {
        this.r = 6779;
      }
      module(function($compileProvider) {
        $compileProvider.directive('test', function() {
          return { restrict: 'A' };
        });
        $compileProvider.component('test', {
          controller: TestController
        });
      });
      inject(function($componentController, $rootScope) {
        var ctrl = $componentController('test', { $scope: {} });
        expect(ctrl).toEqual(new TestController());
      });
    });

    it('should instantiate the controller of the restrict:\'E\' component if there are more directives with the same name and restricted to \'E\' but no controller', function() {
      function TestController() {
        this.r = 22926;
      }
      module(function($compileProvider) {
        $compileProvider.directive('test', function() {
          return { restrict: 'E' };
        });
        $compileProvider.component('test', {
          controller: TestController
        });
      });
      inject(function($componentController, $rootScope) {
        var ctrl = $componentController('test', { $scope: {} });
        expect(ctrl).toEqual(new TestController());
      });
    });

    it('should instantiate the controller of the directive with controller, controllerAs and restrict:\'E\' if there are more directives', function() {
      function TestController() {
        this.r = 18842;
      }
      module(function($compileProvider) {
        $compileProvider.directive('test', function() {
          return { };
        });
        $compileProvider.directive('test', function() {
          return {
            restrict: 'E',
            controller: TestController,
            controllerAs: '$ctrl'
          };
        });
      });
      inject(function($componentController, $rootScope) {
        var ctrl = $componentController('test', { $scope: {} });
        expect(ctrl).toEqual(new TestController());
      });
    });

    it('should fail if there is no directive with restrict:\'E\' and controller', function() {
      function TestController() {
        this.r = 31145;
      }
      module(function($compileProvider) {
        $compileProvider.directive('test', function() {
          return {
            restrict: 'AC',
            controller: TestController
          };
        });
        $compileProvider.directive('test', function() {
          return {
            restrict: 'E',
            controller: TestController
          };
        });
        $compileProvider.directive('test', function() {
          return {
            restrict: 'EA',
            controller: TestController,
            controllerAs: '$ctrl'
          };
        });
        $compileProvider.directive('test', function() {
          return { restrict: 'E' };
        });
      });
      inject(function($componentController, $rootScope) {
        expect(function() {
          $componentController('test', { $scope: {} });
        }).toThrowError('No component found');
      });
    });

    it('should fail if there more than two components with same name', function() {
      function TestController($scope, a, b) {
        this.$scope = $scope;
        this.a = a;
        this.b = b;
      }
      module(function($compileProvider) {
        $compileProvider.directive('test', function() {
          return {
            restrict: 'E',
            controller: TestController,
            controllerAs: '$ctrl'
          };
        });
        $compileProvider.component('test', {
          controller: TestController
        });
      });
      inject(function($componentController, $rootScope) {
        expect(function() {
          var $scope = {};
          $componentController('test', { $scope: $scope, a: 'A', b: 'B' }, { x: 'X', y: 'Y' });
        }).toThrowError('Too many components found');
      });
    });

    it('should create an isolated child of $rootScope, if no `$scope` local is provided', function() {
      function TestController($scope) {
        this.$scope = $scope;
      }
      module(function($compileProvider) {
        $compileProvider.component('test', {
          controller: TestController
        });
      });
      inject(function($componentController, $rootScope) {
        var $ctrl = $componentController('test');
        expect($ctrl.$scope).toBeDefined();
        expect($ctrl.$scope.$parent).toBe($rootScope);
        // check it is isolated
        $rootScope.a = 17;
        expect($ctrl.$scope.a).toBeUndefined();
        $ctrl.$scope.a = 42;
        expect($rootScope.a).toEqual(17);
      });
    });
  });
});


describe('ngMockE2E', function() {
  describe('$httpBackend', function() {
    var hb, realHttpBackend, realHttpBackendBrowser, $http, callback;

    beforeEach(function() {
      callback = jasmine.createSpy('callback');
      angular.module('ng').config(function($provide) {
        realHttpBackend = jasmine.createSpy('real $httpBackend');
        $provide.factory('$httpBackend', ['$browser', function($browser) {
          return realHttpBackend.and.callFake(function() { realHttpBackendBrowser = $browser; });
        }]);
      });
      module('ngMockE2E');
      inject(function($injector) {
        hb = $injector.get('$httpBackend');
        $http = $injector.get('$http');
      });
    });


    it('should throw error when unexpected request - without error callback', function() {
      expect(function() {
        $http.get('/some').then(noop);

        hb.verifyNoOutstandingRequest();
      }).toThrowError('Unexpected request: GET /some\nNo more request expected');
    });


    it('should throw error when unexpected request - with error callback', function() {
      expect(function() {
        $http.get('/some').then(noop, noop);

        hb.verifyNoOutstandingRequest();
      }).toThrowError('Unexpected request: GET /some\nNo more request expected');
    });
