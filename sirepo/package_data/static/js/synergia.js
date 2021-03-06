'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.appLocalRoutes.lattice = '/lattice/:simulationId';
SIREPO.appLocalRoutes.visualization = '/visualization/:simulationId';
SIREPO.appReportTypes = [
    '<div data-ng-switch-when="lattice" data-lattice="" class="sr-plot" data-model-name="{{ modelKey }}"></div>',
].join('');
SIREPO.appHomeTab = 'lattice';
SIREPO.SINGLE_FRAME_ANIMATION = ['beamEvolutionAnimation'];
SIREPO.appFieldEditors = [
    '<div data-ng-switch-when="LatticeBeamlineList" data-ng-class="fieldClass">',
      '<div data-lattice-beamline-list="" data-model="model" data-field="field"></div>',
    '</div>',
    '<div data-ng-switch-when="TurnCount" data-ng-class="fieldClass">',
      '<div data-turn-count-field="" field="field" data-model="model"></div>',
    '</div>',
].join('');
SIREPO.appImportText = 'Import a MAD-X Lattice';
SIREPO.app.config(function($routeProvider, localRoutesProvider) {
    if (SIREPO.IS_LOGGED_OUT) {
        return;
    }
    var localRoutes = localRoutesProvider.$get();
    $routeProvider
        .when(localRoutes.source, {
            controller: 'SynergiaSourceController as source',
            templateUrl: '/static/html/synergia-source.html' + SIREPO.SOURCE_CACHE_KEY,
        })
        .when(localRoutes.lattice, {
            controller: 'LatticeController as lattice',
            template: '<div data-lattice-tab="" data-controller="lattice"></div>',
        })
        .when(localRoutes.visualization, {
            controller: 'VisualizationController as visualization',
            templateUrl: '/static/html/synergia-visualization.html' + SIREPO.SOURCE_CACHE_KEY,
        });
});

SIREPO.app.controller('LatticeController', function(latticeService) {
    var self = this;
    self.latticeService = latticeService;

    self.advancedNames = ['DIPEDGE', 'ECOLLIMATOR', 'HKICKER', 'HMONITOR', 'MARKER', 'MULTIPOLE', 'NLLENS', 'RCOLLIMATOR', 'SEXTUPOLE', 'SOLENOID', 'SROTATION', 'VKICKER', 'VMONITOR'];

    self.basicNames = ['DRIFT', 'MONITOR', 'KICKER', 'QUADRUPOLE', 'RFCAVITY', 'SBEND'];

    self.elementColor = {
        QUADRUPOLE: 'red',
        SEXTUPOLE: 'lightgreen',
        VKICKER: 'blue',
    };

    self.elementPic = {
        aperture: ['ECOLLIMATOR', 'RCOLLIMATOR'],
        bend: ['HKICKER', 'KICKER', 'MULTIPOLE', 'SBEND'],
        drift: ['DRIFT'],
        magnet: ['QUADRUPOLE', 'SEXTUPOLE', 'VKICKER'],
        rf: ['RFCAVITY'],
        solenoid: ['SOLENOID'],
        watch: ['HMONITOR', 'MARKER', 'MONITOR', 'VMONITOR'],
        zeroLength: ['DIPEDGE', 'NLLENS', 'SROTATION'],
    };

    self.titleForName = function(name) {
        return SIREPO.APP_SCHEMA.view[name].description;
    };
});

SIREPO.app.controller('SynergiaSourceController', function (appState, panelState, requestSender, $scope) {
    var self = this;

    function calculateBunchParameters() {
        requestSender.getApplicationData(
            {
                method: 'calculate_bunch_parameters',
                bunch: appState.clone(appState.models.bunch),
            },
            function(data) {
                if (data.bunch && appState.isLoaded()) {
                    appState.models.bunch = data.bunch;
                }
            });
    }

    function processBeamDefinition() {
        processBunchFields();
        calculateBunchParameters();
    }

    function processBunchFields() {
        var bunch = appState.models.bunch;
        panelState.enableField('bunch', 'beta', false);
        var def = bunch.beam_definition;
        panelState.enableField('bunch', 'energy', def == 'energy');
        panelState.enableField('bunch', 'momentum', def == 'momentum');
        panelState.enableField('bunch', 'gamma', def == 'gamma');
        ['mass', 'charge'].forEach(function(f) {
            panelState.enableField('bunch', f, bunch.particle == 'other');
        });
        var isFile = bunch.distribution == 'file';
        panelState.showRow('bunch', 'emit_x', ! isFile);
        ['rms_z', 'dpop', 'num_macro_particles', 'seed'].forEach(function(f) {
            panelState.showField('bunch', f, ! isFile);
        });
        panelState.showField('bunch', 'particleFile', isFile);
        var isLattice = bunch.distribution == 'lattice';
        ['beta_x', 'beta_y', 'alpha_x', 'alpha_y'].forEach(function(f) {
            panelState.enableField('bunch', f, ! isLattice);
            if (isLattice) {
                bunch[f] = appState.models.bunchTwiss[f];
            }
        });
        ['nonlinear_t', 'nonlinear_c', 'nonlinear_cutoff'].forEach(function(f) {
            panelState.showField('bunch', f, bunch.distribution.indexOf('nonlinear') >= 0);
        });
    }

    self.handleModalShown = function(name) {
        if (name == 'bunch') {
            processBunchFields();
        }
    };

    appState.whenModelsLoaded($scope, function() {
        processBeamDefinition();
        appState.watchModelFields($scope, ['bunch.distribution'], processBunchFields);
        appState.watchModelFields($scope, ['bunch.beam_definition', 'bunch.particle'], processBeamDefinition);
        appState.watchModelFields($scope, ['bunch.mass', 'bunch.energy', 'bunch.momentum', 'bunch.gamma'], calculateBunchParameters);
    });

    $scope.$on('bunchReport.summaryData', function(e, info) {
        if (appState.isLoaded() && info.bunchTwiss) {
            appState.models.bunchTwiss = info.bunchTwiss;
            appState.saveChanges('bunchTwiss');
            processBunchFields();
        }
    });

});

SIREPO.app.controller('VisualizationController', function (appState, frameCache, panelState, persistentSimulation, requestSender, $scope) {
    var self = this;
    var fieldRange;
    var turnCount = 0;
    self.settingsModel = 'simulationStatus';
    self.panelState = panelState;
    self.errorMessage = '';
    self.isComputingRanges = false;

    function handleStatus(data) {
        frameCache.setFrameCount(0, 'turnComparisonAnimation');
        turnCount = 0;
        self.errorMessage = data.error;
        if (data.startTime && ! data.error) {
            if (self.simState.isStateRunning()) {
                appState.models.bunchAnimation.isRunning = 1;
            }
            turnCount = data.turnCount;
            ['beamEvolutionAnimation', 'bunchAnimation', 'turnComparisonAnimation'].forEach(function(m) {
                appState.models[m].startTime = data.startTime;
                appState.saveQuietly(m);
                var key = m + '.frameCount';
                if (!(key in data)) {
                    key = 'frameCount';
                }
                if (m != 'turnComparisonAnimation') {
                    frameCache.setFrameCount(data[key], m);
                }
            });
            if (data.percentComplete == 100 && ! self.isComputingRanges) {
                frameCache.setFrameCount(1, 'turnComparisonAnimation');
                fieldRange = null;
                self.isComputingRanges = true;
                requestSender.getApplicationData(
                    {
                        method: 'compute_particle_ranges',
                        simulationId: appState.models.simulation.simulationId,
                    },
                    function(data) {
                        self.isComputingRanges = false;
                        if (appState.isLoaded() && data.fieldRange) {
                            appState.models.bunchAnimation.isRunning = 0;
                            appState.saveQuietly('bunchAnimation');
                            fieldRange = data.fieldRange;
                        }
                    });
            }
        }
        frameCache.setFrameCount(data.frameCount || 0);
    }

    function processPlotRange() {
        var bunchAnimation = appState.models.bunchAnimation;
        panelState.showEnum('bunchAnimation', 'plotRangeType', 'fit', fieldRange);
        panelState.showRow('bunchAnimation', 'horizontalSize', bunchAnimation.plotRangeType != 'none');
        ['horizontalSize', 'horizontalOffset', 'verticalSize', 'verticalOffset'].forEach(function(f) {
            panelState.enableField('bunchAnimation', f, bunchAnimation.plotRangeType == 'fixed');
        });
        if (bunchAnimation.plotRangeType == 'fit' && fieldRange) {
            setFieldRange('horizontal', bunchAnimation, 'x');
            setFieldRange('vertical', bunchAnimation, 'y');
        }
    }

    function setFieldRange(prefix, bunchAnimation, field) {
        var f = bunchAnimation[field];
        var range = fieldRange[f];
        bunchAnimation[prefix + 'Size'] = range[1] - range[0];
        bunchAnimation[prefix + 'Offset'] = (range[0] + range[1]) / 2;
    }

    self.handleModalShown = function(name) {
        if (name == 'bunchAnimation') {
            processPlotRange();
        }
    };

    self.hasTurnComparisonResults = function() {
        return frameCache.getFrameCount('turnComparisonAnimation') > 0;
    };

    self.notRunningMessage = function() {
        return 'Simulation ' + self.simState.stateAsText();
    };

    self.runningMessage = function() {
        if (appState.isLoaded() && turnCount) {
            return 'Simulating turn: ' + turnCount + ' / ' + appState.models.simulationSettings.turn_count;
        }
        return 'Simulation running';
    };

    appState.whenModelsLoaded($scope, function() {
        appState.watchModelFields($scope, ['bunchAnimation.plotRangeType'], processPlotRange);
    });

    self.simState = persistentSimulation.initSimulationState($scope, 'animation', handleStatus, {
        beamEvolutionAnimation: [SIREPO.ANIMATION_ARGS_VERSION + '2', 'y1', 'y2', 'y3', 'startTime'],
        bunchAnimation: [SIREPO.ANIMATION_ARGS_VERSION + '2', 'x', 'y', 'histogramBins', 'plotRangeType', 'horizontalSize', 'horizontalOffset', 'verticalSize', 'verticalOffset', 'isRunning', 'startTime'],
        turnComparisonAnimation: [SIREPO.ANIMATION_ARGS_VERSION + '1', 'y', 'turn1', 'turn2', 'startTime'],
    });
});

SIREPO.app.directive('appFooter', function() {
    return {
        restrict: 'A',
        scope: {
            nav: '=appFooter',
        },
        template: [
            '<div data-common-footer="nav"></div>',
            '<div data-import-dialog="" data-title="Import Synergia File" data-description="Select MAD-X (.madx) or Sirepo Export (.zip)" data-file-formats=".madx,.zip"></div>',
        ].join(''),
    };
});

SIREPO.app.directive('appHeader', function(appState, panelState) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appHeader',
        },
        template: [
            '<div data-app-header-brand="nav"></div>',
            '<div data-app-header-left="nav"></div>',
            '<div data-app-header-right="nav">',
              '<app-header-right-sim-loaded>',
		'<div data-sim-sections="">',
                  '<li class="sim-section" data-ng-class="{active: nav.isActive(\'lattice\')}"><a data-ng-href="{{ nav.sectionURL(\'lattice\') }}"><span class="glyphicon glyphicon-option-horizontal"></span> Lattice</a></li>',
                  '<li class="sim-section" data-ng-if="hasBeamlines()" data-ng-class="{active: nav.isActive(\'source\')}"><a href data-ng-click="nav.openSection(\'source\')"><span class="glyphicon glyphicon-flash"></span> Bunch</a></li>',
                  '<li class="sim-section" data-ng-if="hasBeamlines()" data-ng-class="{active: nav.isActive(\'visualization\')}"><a data-ng-href="{{ nav.sectionURL(\'visualization\') }}"><span class="glyphicon glyphicon-picture"></span> Visualization</a></li>',
                '</div>',
              '</app-header-right-sim-loaded>',
              '<app-settings>',
		//  '<div>App-specific setting item</div>',
	      '</app-settings>',
              '<app-header-right-sim-list>',
                '<ul class="nav navbar-nav sr-navbar-right">',
                  '<li><a href data-ng-click="nav.showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>',
                '</ul>',
              '</app-header-right-sim-list>',
            '</div>',
	].join(''),
        controller: function($scope) {
            $scope.hasBeamlines = function() {
                if (! $scope.nav.isLoaded()) {
                    return false;
                }
                for (var i = 0; i < appState.models.beamlines.length; i++) {
                    var beamline = appState.models.beamlines[i];
                    if (beamline.items.length > 0) {
                        return true;
                    }
                }
                return false;
            };
        },
    };
});

SIREPO.app.directive('turnCountField', function(appState) {
    return {
        restrict: 'A',
        scope: {
            model: '=',
            field: '=',
        },
        template: [
            '<select class="form-control" data-ng-model="model[field]" data-ng-options="name as name for name in turnCountList()"></select>',
        ].join(''),
        controller: function($scope) {
            var turnCountList = [];
            $scope.turnCountList = function() {
                if (! appState.isLoaded() || ! $scope.model) {
                    return null;
                }
                var turnCount = appState.applicationState().simulationSettings.turn_count;
                if (turnCount == turnCount.length - 1) {
                    return turnCountList;
                }
                turnCountList.length = 0;
                for (var i = 1; i <= turnCount; i++) {
                    turnCountList.push('' + i);
                }
                return turnCountList;
            };
        },
    };
});
