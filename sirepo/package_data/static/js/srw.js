'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.appLocalRoutes.beamline = '/beamline/:simulationId';
SIREPO.appDefaultSimulationValues.simulation.sourceType = 'u';
//TODO(pjm): provide API for this, keyed by field type
SIREPO.appFieldEditors = [
    '<div data-ng-switch-when="BeamList">',
      '<div data-model-selection-list="" data-model-name="modelName" data-model="model" data-field="field" data-field-class="fieldClass"></div>',
    '</div>',
    '<div data-ng-switch-when="UndulatorList">',
      '<div data-model-selection-list="" data-model-name="modelName" data-model="model" data-field="field" data-field-class="fieldClass"></div>',
    '</div>',
    '<div data-ng-switch-when="ImageFile" class="col-sm-7">',
      '<div data-file-field="field" data-file-type="sample" data-want-file-report="false" data-want-image-file="true" data-model="model" data-selection-required="true" data-empty-selection-text="Select Image File"></div>',
    '</div>',
    '<div data-ng-switch-when="MagneticZipFile" class="col-sm-7">',
      '<div data-file-field="field" data-file-type="undulatorTable" data-model="model" data-selection-required="true" data-empty-selection-text="Select Magnetic Zip File"></div>',
    '</div>',
    '<div data-ng-switch-when="MirrorFile" class="col-sm-7">',
      '<div data-file-field="field" data-file-type="mirror" data-want-file-report="true" data-model="model" data-selection-required="modelName == \'mirror\'" data-empty-selection-text="No Mirror Error"></div>',
    '</div>',
].join('');

SIREPO.app.config(function($routeProvider, localRoutesProvider) {
    if (SIREPO.IS_LOGGED_OUT) {
        return;
    }
    var localRoutes = localRoutesProvider.$get();
    $routeProvider
        .when(localRoutes.source, {
            controller: 'SRWSourceController as source',
            templateUrl: '/static/html/srw-source.html' + SIREPO.SOURCE_CACHE_KEY,
        })
        .when(localRoutes.beamline, {
            controller: 'SRWBeamlineController as beamline',
            templateUrl: '/static/html/srw-beamline.html' + SIREPO.SOURCE_CACHE_KEY,
        });
});

SIREPO.app.factory('srwService', function(activeSection, appState, panelState, $rootScope, $location) {
    var self = {};
    self.applicationMode = 'default';
    self.originalCharacteristicEnum = null;
    self.singleElectronCharacteristicEnum = null;

    function initCharacteristic() {
        if (self.originalCharacteristicEnum) {
            return;
        }
        self.originalCharacteristicEnum = SIREPO.APP_SCHEMA.enum.Characteristic;
        var characteristic = appState.clone(SIREPO.APP_SCHEMA.enum.Characteristic);
        characteristic.splice(1, 1);
        for (var i = 0; i < characteristic.length; i++)
            characteristic[i][1] = characteristic[i][1].replace(/Single-Electron /g, '');
        self.singleElectronCharacteristicEnum = characteristic;
    }

    function isSelected(sourceType) {
        if (appState.isLoaded()) {
            return appState.applicationState().simulation.sourceType == sourceType;
        }
        return false;
    }

    self.getReportTitle = function(modelName, itemId) {
        var savedModelValues = appState.applicationState();
        if (itemId && savedModelValues.beamline) {
            for (var i = 0; i < savedModelValues.beamline.length; i += 1) {
                if (savedModelValues.beamline[i].id == itemId) {
                    return 'Intensity at ' + savedModelValues.beamline[i].title + ' Report, '
                        + savedModelValues.beamline[i].position + 'm';
                }
            }
        }
        var model = savedModelValues[modelName];
        var distance = '';
        if (model && 'distanceFromSource' in model) {
            distance = ', ' + model.distanceFromSource + 'm';
        }
        else if (appState.isAnimationModelName(modelName)) {
            distance = '';
        }
        else if (appState.isReportModelName(modelName) && savedModelValues.beamline && savedModelValues.beamline.length) {
            distance = ', ' + savedModelValues.beamline[0].position + 'm';
        }
        return appState.viewInfo(modelName).title + distance;
    };

    self.isApplicationMode = function(name) {
        return name == self.applicationMode;
    };

    self.isElectronBeam = function() {
        return self.isIdealizedUndulator() || self.isTabulatedUndulator() || self.isMultipole();
    };

    self.isGaussianBeam = function() {
        return isSelected('g');
    };

    self.isIdealizedUndulator = function() {
        return isSelected('u');
    };

    self.isMultipole = function() {
        return isSelected('m');
    };

    self.isPredefinedBeam = function() {
        if (appState.isLoaded()) {
            return appState.models.electronBeam.isReadOnly ? true : false;
        }
        return false;
    };

    self.isTabulatedUndulator = function() {
        return isSelected('t');
    };

    self.isTabulatedUndulatorWithMagenticFile = function() {
        return self.isTabulatedUndulator() && appState.models.tabulatedUndulator.undulatorType == 'u_t';
    };

    self.setupWatchpointDirective = function($scope) {
        var modelKey = 'watchpointReport' + $scope.itemId;
        $scope.modelAccess = {
            modelKey: modelKey,
            getData: function() {
                return appState.models[modelKey];
            },
        };

        $scope.reportTitle = function() {
            return self.getReportTitle('watchpointReport', $scope.itemId);
        };
    };


    self.updateSimulationGridFields = function() {
        if (! appState.isLoaded()) {
            return;
        }
        panelState.showField('simulation', 'photonEnergy', activeSection.getActiveSection() == 'beamline');
        var isAutomatic = appState.models.simulation.samplingMethod == 1;
        panelState.showField('simulation', 'sampleFactor', isAutomatic);
        panelState.showField('simulation', 'horizontalPointCount', ! isAutomatic);
        panelState.showField('simulation', 'verticalPointCount', ! isAutomatic);
    };

    $rootScope.$on('$routeChangeSuccess', function() {
        var search = $location.search();
        if (search && search.application_mode) {
            self.applicationMode = search.application_mode;
        }
    });

    appState.whenModelsLoaded($rootScope, function() {
        initCharacteristic();
        // don't show multi-electron values in certain cases
        SIREPO.APP_SCHEMA.enum.Characteristic = (self.isApplicationMode('wavefront') || self.isGaussianBeam())
            ? self.singleElectronCharacteristicEnum
            : self.originalCharacteristicEnum;
    });

    return self;
});

SIREPO.app.controller('SRWBeamlineController', function (appState, panelState, requestSender, srwService, $scope, simulationQueue) {
    var self = this;

    var toolbarItems = [
        appState.setModelDefaults({type: 'aperture'}, 'aperture'),
        appState.setModelDefaults({type: 'obstacle'}, 'obstacle'),
        appState.setModelDefaults({type: 'mask', show: SIREPO.APP_SCHEMA.feature_config.mask_in_toolbar}, 'mask'),
        appState.setModelDefaults({type: 'fiber'}, 'fiber'),
        appState.setModelDefaults({type: 'crystal'}, 'crystal'),
        appState.setModelDefaults({type: 'grating'}, 'grating'),
        appState.setModelDefaults({type: 'lens'}, 'lens'),
        appState.setModelDefaults({type: 'crl'}, 'crl'),
        appState.setModelDefaults({type: 'mirror'}, 'mirror'),
        appState.setModelDefaults({type: 'sphericalMirror'}, 'sphericalMirror'),
        appState.setModelDefaults({type: 'ellipsoidMirror'}, 'ellipsoidMirror'),
        appState.setModelDefaults({type: 'watch'}, 'watch'),
        appState.setModelDefaults({type: 'sample', show: SIREPO.APP_SCHEMA.feature_config.sample_in_toolbar}, 'sample'),
    ];
    self.toolbarItems = [];
    for (var i = 0; i < toolbarItems.length; i++) {
        if (!('show' in toolbarItems[i]) || toolbarItems[i].show) {
            self.toolbarItems.push(toolbarItems[i]);
        }
    }

    self.panelState = panelState;
    self.srwService = srwService;
    self.activeItem = null;
    self.postPropagation = [];
    self.propagations = [];
    self.analyticalTreatmentEnum = SIREPO.APP_SCHEMA.enum.AnalyticalTreatment;
    self.singleElectron = true;

    function addItem(item) {
        var newItem = appState.clone(item);
        newItem.id = appState.maxId(appState.models.beamline) + 1;
        newItem.showPopover = true;
        if (appState.models.beamline.length) {
            newItem.position = parseFloat(appState.models.beamline[appState.models.beamline.length - 1].position) + 1;
        }
        else {
            newItem.position = 20;
        }
        if (newItem.type == 'ellipsoidMirror') {
            newItem.firstFocusLength = newItem.position;
        }
        if (newItem.type == 'watch') {
            appState.models[watchpointReportName(newItem.id)] = appState.cloneModel('initialIntensityReport');
        }
        appState.models.beamline.push(newItem);
        self.dismissPopup();
    }

    function calculatePropagation() {
        if (! appState.isLoaded()) {
            return;
        }
        var beamline = appState.models.beamline;
        if (! appState.models.propagation) {
            appState.models.propagation = {};
        }
        var propagation = appState.models.propagation;
        self.propagations = [];
        for (var i = 0; i < beamline.length; i++) {
            if (! propagation[beamline[i].id]) {
                propagation[beamline[i].id] = [
                    defaultItemPropagationParams(),
                    defaultDriftPropagationParams(),
                ];
            }
            var p = propagation[beamline[i].id];
            if (beamline[i].type != 'watch') {
                self.propagations.push({
                    item: beamline[i],
                    title: beamline[i].title,
                    params: p[0],
                });
            }
            if (i == beamline.length - 1) {
                break;
            }
            var d = parseFloat(beamline[i + 1].position) - parseFloat(beamline[i].position);
            if (d > 0) {
                self.propagations.push({
                    title: 'Drift ' + formatFloat(d) + 'm',
                    params: p[1],
                });
            }
        }
        if (! appState.models.postPropagation || appState.models.postPropagation.length === 0) {
            appState.models.postPropagation = defaultItemPropagationParams();
        }
        self.postPropagation = appState.models.postPropagation;
    }

    function defaultItemPropagationParams() {
        return [0, 0, 1, 0, 0, 1.0, 1.0, 1.0, 1.0];
    }

    function defaultDriftPropagationParams() {
        return [0, 0, 1, 1, 0, 1.0, 1.0, 1.0, 1.0];
    }

    function formatFloat(v) {
        var str = v.toFixed(4);
        str = str.replace(/0+$/, '');
        str = str.replace(/\.$/, '');
        return str;
    }

    function isPropagationModelName(name) {
        return name.toLowerCase().indexOf('propagation') >= 0;
    }

    function isWatchpointReportModelName(name) {
        return name.indexOf('watchpointReport') >= 0;
    }

    function saveBeamline() {
        // culls and saves propagation and watchpoint models
        var propagations = {};
        var watchpoints = {};
        for (var i = 0; i < appState.models.beamline.length; i++) {
            var item = appState.models.beamline[i];
            propagations[item.id] = appState.models.propagation[item.id];
            if (item.type == 'watch') {
                watchpoints[watchpointReportName(item.id)] = true;
            }
        }
        appState.models.propagation = propagations;

        // need to save all watchpointReports and propagations for beamline changes
        var savedModelValues = appState.applicationState();
        for (var modelName in appState.models) {
            if (isWatchpointReportModelName(modelName) && ! watchpoints[modelName]) {
                // deleted watchpoint, remove the report model
                delete appState.models[modelName];
                delete savedModelValues[modelName];
                continue;
            }
            if (isWatchpointReportModelName(modelName)) {
                savedModelValues[modelName] = appState.cloneModel(modelName);
            }
        }
        appState.saveChanges(['beamline', 'propagation', 'postPropagation']);
    }

    function updatePhotonEnergyHelpText() {
        if (appState.isLoaded()) {
            var msg = 'The photon energy is: ' + appState.models.simulation.photonEnergy + ' eV';
            SIREPO.APP_SCHEMA.model.crl.refractiveIndex[3] = msg;
            SIREPO.APP_SCHEMA.model.crl.attenuationLength[3] = msg;
            SIREPO.APP_SCHEMA.model.mask.refractiveIndex[3] = msg;
            SIREPO.APP_SCHEMA.model.mask.attenuationLength[3] = msg;
            SIREPO.APP_SCHEMA.model.fiber.externalRefractiveIndex[3] = msg;
            SIREPO.APP_SCHEMA.model.fiber.externalAttenuationLength[3] = msg;
            SIREPO.APP_SCHEMA.model.fiber.coreRefractiveIndex[3] = msg;
            SIREPO.APP_SCHEMA.model.fiber.coreAttenuationLength[3] = msg;
            SIREPO.APP_SCHEMA.model.sample.refractiveIndex[3] = msg;
            SIREPO.APP_SCHEMA.model.sample.attenuationLength[3] = msg;
        }
    }

    function watchpointReportName(id) {
        return 'watchpointReport' + id;
    }

    self.cancelBeamlineChanges = function() {
        self.dismissPopup();
        appState.cancelChanges(['beamline', 'propagation', 'postPropagation']);
    };

    self.checkIfDirty = function() {
        var savedValues = appState.applicationState();
        var models = appState.models;
        if (appState.deepEquals(savedValues.beamline, models.beamline)
            && appState.deepEquals(savedValues.propagation, models.propagation)
            && appState.deepEquals(savedValues.postPropagation, models.postPropagation)) {
            return false;
        }
        return true;
    };

    self.dismissPopup = function() {
        $('.srw-beamline-element-label').popover('hide');
    };

    self.dropBetween = function(index, data) {
        if (! data) {
            return;
        }
        var item;
        if (data.id) {
            self.dismissPopup();
            var curr = appState.models.beamline.indexOf(data);
            if (curr < index) {
                index--;
            }
            appState.models.beamline.splice(curr, 1);
            item = data;
        }
        else {
            // move last item to this index
            item = appState.models.beamline.pop();
        }
        appState.models.beamline.splice(index, 0, item);
        if (appState.models.beamline.length > 1) {
            if (index === 0) {
                item.position = parseFloat(appState.models.beamline[1].position) - 0.5;
            }
            else if (index === appState.models.beamline.length - 1) {
                item.position = parseFloat(appState.models.beamline[appState.models.beamline.length - 1].position) + 0.5;
            }
            else {
                item.position = Math.round(100 * (parseFloat(appState.models.beamline[index - 1].position) + parseFloat(appState.models.beamline[index + 1].position)) / 2) / 100;
            }
        }
    };

    self.dropComplete = function(data) {
        if (data && ! data.id) {
            addItem(data);
        }
    };

    self.getBeamline = function() {
        return appState.models.beamline;
    };

    self.getWatchItems = function() {
        if (appState.isLoaded()) {
            var beamline = appState.applicationState().beamline;
            var res = [];
            for (var i = 0; i < beamline.length; i++) {
                if (beamline[i].type == 'watch') {
                    res.push(beamline[i]);
                }
            }
            return res;
        }
        return [];
    };

    self.handleModalShown = function(name) {
        if (appState.isLoaded()) {
            panelState.showField('watchpointReport', 'fieldUnits', srwService.isGaussianBeam());
            panelState.showField('initialIntensityReport', 'fieldUnits', srwService.isGaussianBeam());
        }
    };

    self.isDisabledPropagation = function(prop) {
        if (prop.item) {
            return prop.item.isDisabled;
        }
        return false;
    };

    self.isDefaultMode = function() {
        return srwService.isApplicationMode('default');
    };

    self.isPropagationReadOnly = function() {
        //TODO(pjm): may want to disable this for novice users
        //return ! self.isDefaultMode();
        return false;
    };

    self.isSingleElectron = function() {
        return self.singleElectron;
    };

    self.isMultiElectron = function() {
        return ! self.isSingleElectron();
    };

    self.isTouchscreen = function() {
        return Modernizr.touch;
    };

    self.mirrorReportTitle = function() {
        if (self.activeItem && self.activeItem.title) {
            return self.activeItem.title;
        }
        return '';
    };

    self.removeElement = function(item) {
        self.dismissPopup();
        appState.models.beamline.splice(appState.models.beamline.indexOf(item), 1);
    };

    self.saveBeamlineChanges = function() {
        // sort beamline based on position
        appState.models.beamline.sort(function(a, b) {
            return parseFloat(a.position) - parseFloat(b.position);
        });
        calculatePropagation();
        saveBeamline();
    };

    self.setActiveItem = function(item) {
        self.activeItem = item;
    };

    self.setSingleElectron = function(value) {
        value = !!value;
        if (value != self.singleElectron) {
            simulationQueue.cancelAllItems();
        }
        self.singleElectron = value;
    };

    self.showFileReport = function(type, model) {
        self.mirrorReportShown = true;
        appState.models.mirrorReport = model;
        appState.saveQuietly('mirrorReport');
        var el = $('#srw-mirror-plot');
        el.modal('show');
        el.on('shown.bs.modal', function() {
            // this forces the plot to reload
            appState.saveChanges('mirrorReport');
        });
        el.on('hidden.bs.modal', function() {
            self.mirrorReportShown = false;
            el.off();
        });
    };

    self.showPropagationModal = function() {
        calculatePropagation();
        self.dismissPopup();
        $('#srw-propagation-parameters').modal('show');
    };

    self.showTabs = function() {
        if (self.getWatchItems().length === 0) {
            return false;
        }
        if (srwService.isApplicationMode('wavefront')) {
            return false;
        }
        if (srwService.isGaussianBeam()) {
            return false;
        }
        return true;
    };

    //TODO(pjm): coupled with controller named "beamline"
    $scope.$watch('beamline.activeItem.grazingAngle', function (newValue, oldValue) {
        if (newValue !== null && angular.isDefined(newValue) && angular.isDefined(oldValue)) {
            var item = self.activeItem;
            if (item.type === 'grating' || item.type === 'ellipsoidMirror' || item.type === 'sphericalMirror') {
                requestSender.getApplicationData(
                    {
                        method: 'compute_grazing_angle',
                        optical_element: item,
                    },
                    function(data) {
                        var fields = ['normalVectorZ', 'normalVectorY', 'normalVectorX', 'tangentialVectorY', 'tangentialVectorX'];
                        for (var i = 0; i < fields.length; i++) {
                            item[fields[i]] = data[fields[i]];
                        }
                    }
                );
            }
        }
    });

    function checkChanged(newValues, oldValues) {
        for (var i = 0; i < newValues.length; i++) {
            if (! angular.isDefined(newValues[i]) || newValues[i] === null || newValues[i] === 'Unknown' || ! angular.isDefined(oldValues[i])) {
                return false;
            }
        }
        return true;
    }

    function checkDefined(values) {
        for (var i = 0; i < values.length; i++) {
            if (typeof(values[i]) === 'undefined' || values[i] === null) {
                return false;
            }
        }
        return true;
    }

    function wrapActiveItem(fields) {
        var fieldsList = [];
        for (var i=0; i<fields.length; i++) {
            fieldsList.push('beamline.activeItem.' + fields[i].toString());
        }
        return '[' + fieldsList.toString() + ']';
    }

    appState.whenModelsLoaded($scope, updatePhotonEnergyHelpText);
    $scope.$on('simulation.changed', updatePhotonEnergyHelpText);

    var CRLFields = [
        'material',
        'method',
        'numberOfLenses',
        'position',
        'tipRadius',
        'refractiveIndex',
    ];
    function computeCRLCharacteristics() {
        var item = self.activeItem;
        if (item.type === 'crl') {
            requestSender.getApplicationData(
                {
                    method: 'compute_crl_characteristics',
                    optical_element: item,
                    photon_energy: appState.models.simulation.photonEnergy,
                },
                function(data) {
                    var fields = ['refractiveIndex', 'attenuationLength'];
                    for (var i = 0; i < fields.length; i++) {
                        item[fields[i]] = parseFloat(data[fields[i]]).toExponential(6);
                    }

                    fields = ['focalDistance', 'absoluteFocusPosition'];
                    for (i = 0; i < fields.length; i++) {
                        item[fields[i]] = parseFloat(data[fields[i]]).toFixed(4);
                    }
                }
            );
        }
    }
    $scope.$watchCollection(wrapActiveItem(CRLFields), function (newValues, oldValues) {
        panelState.showField('crl', 'method', newValues[0] != 'User-defined');
        if (checkDefined(newValues)) {
            computeCRLCharacteristics();
        }
    });

    var fiberFields = [
        'method',
        'externalMaterial',
        'coreMaterial',
    ];
    function computeFiberCharacteristics() {
        var item = self.activeItem;
        if (item.type === 'fiber') {
            requestSender.getApplicationData(
                {
                    method: 'compute_fiber_characteristics',
                    optical_element: item,
                    photon_energy: appState.models.simulation.photonEnergy,
                },
                function(data) {
                    var fields = [
                        'externalRefractiveIndex', 'externalAttenuationLength',
                        'coreRefractiveIndex', 'coreAttenuationLength',
                    ];
                    for (var i = 0; i < fields.length; i++) {
                        item[fields[i]] = parseFloat(data[fields[i]]).toExponential(6);
                    }
                }
            );
        }
    }
    $scope.$watchCollection(wrapActiveItem(fiberFields), function (newValues, oldValues) {
        panelState.showField('fiber', 'method', ! (newValues[1] === 'User-defined' && newValues[2] === 'User-defined'));
        if (checkDefined(newValues)) {
            computeFiberCharacteristics();
        }
    });

    function computeDeltaAttenCharacteristics() {
        var item = self.activeItem;
        requestSender.getApplicationData(
            {
                method: 'compute_delta_atten_characteristics',
                optical_element: item,
                photon_energy: appState.models.simulation.photonEnergy,
            },
            function(data) {
                var fields = [
                    'refractiveIndex', 'attenuationLength',
                ];
                for (var i = 0; i < fields.length; i++) {
                    item[fields[i]] = parseFloat(data[fields[i]]);
                    if (item[fields[i]] < 1e-3) {
                        item[fields[i]] = item[fields[i]].toExponential(6);
                    }
                    else if (item[fields[i]] === 1) {
                        // pass
                    }
                    else {
                        item[fields[i]] = item[fields[i]].toFixed(6);
                    }
                }
            }
        );
    }
    $scope.$watchCollection(wrapActiveItem(['method', 'material']), function (newValues, oldValues) {
        if (self.activeItem) {
            var item = self.activeItem;
            if (item.type === 'mask' || item.type === 'sample') {
                panelState.showField(item.type, 'method', newValues[1] != 'User-defined');
                if (checkDefined(newValues)) {
                    computeDeltaAttenCharacteristics();
                }
            }
        }
    });

    var crystalInitFields = [
        'material',
        'energy',
        'h',
        'k',
        'l',
    ];
    $scope.$watchCollection(wrapActiveItem(crystalInitFields), function (newValues, oldValues) {
        if (checkChanged(newValues, oldValues)) {
            var item = self.activeItem;
            if (item.type === 'crystal') {
                requestSender.getApplicationData(
                    {
                        method: 'compute_crystal_init',
                        optical_element: item,
                    },
                    function(data) {
                        var fields = ['dSpacing', 'psi0r', 'psi0i', 'psiHr', 'psiHi', 'psiHBr', 'psiHBi', 'grazingAngle'];
                        for (var i = 0; i < fields.length; i++) {
                            item[fields[i]] = data[fields[i]];
                        }
                    }
                );
            }
        }
    });

    var crystalOrientationFields = [
        'grazingAngle',
        'dSpacing',
        'asymmetryAngle',
        'psi0r',
        'psi0i',
        'rotationAngle',
    ];
    $scope.$watchCollection(wrapActiveItem(crystalOrientationFields), function (newValues, oldValues) {
        if (checkChanged(newValues, oldValues)) {
            var item = self.activeItem;
            if (item.type === 'crystal') {
                requestSender.getApplicationData(
                    {
                        method: 'compute_crystal_orientation',
                        optical_element: item,
                    },
                    function(data) {
                        var fields = ['nvx', 'nvy', 'nvz', 'tvx', 'tvy'];
                        for (var i = 0; i < fields.length; i++) {
                            item[fields[i]] = data[fields[i]];
                        }
                    }
                );
            }
        }
    });
});

SIREPO.app.controller('SRWSourceController', function (appState, panelState, requestSender, srwService, $document, $scope) {
    var self = this;
    var isReadyForInput = false;
    // required for $watch below
    $scope.appState = appState;
    self.srwService = srwService;
    var FORMAT_DECIMALS = 8;

    function isActiveField(model, field) {
        var fieldClass = '.model-' + model + '-' + field;
        return $(fieldClass).find('input').is(':focus');
    }

    function convertGBSize(field, energy) {
        var value = appState.models.gaussianBeam[field];
        var waveLength = (1239.84193 * 1e-9) / energy;  // [m]
        var factor = waveLength / (4 * Math.PI);
        var res = null;
        // TODO(MR): get units automatically.
        res = factor / (value * 1e-6) * 1e6;  // [um] -> [urad] or [urad] -> [um]
        if (isNaN(res) || ! isFinite(res)) {
            return null;
        }
        return res.toFixed(6);
    }

    function disableBasicEditorBeamName() {
        $('#s-electronBeam-basicEditor .model-electronBeam-name input').prop('readonly', true);
    }

    function formatFloat(v) {
        return +parseFloat(v).toFixed(FORMAT_DECIMALS);
    }

    function isAutoDrift() {
        if (isReadyForInput) {
            return appState.models.electronBeamPosition.driftCalculationMethod === 'auto';
        }
        return false;
    }

    function isTwissDefinition() {
        if (isReadyForInput) {
            return appState.models.electronBeam.beamDefinition === 't';
        }
        return false;
    }

    function processBeamFields() {
        var isPredefinedBeam = srwService.isPredefinedBeam();
        var ebeam = appState.models.electronBeam;
        // enable/disable beam fields
        for (var f in ebeam) {
            panelState.enableField('electronBeam', f, ! isPredefinedBeam);
        }
        disableBasicEditorBeamName();
        // show/hide column headings and input fields for the twiss/moments sections
        panelState.showRow('electronBeam', 'horizontalEmittance', isTwissDefinition());
        panelState.showRow('electronBeam', 'rmsSizeX', ! isTwissDefinition());
        panelState.enableField('electronBeamPosition', 'drift', ! isAutoDrift());
    }

    function processBeamParameters() {
        requestSender.getApplicationData(
            {
                method: 'process_beam_parameters',
                source_type: appState.models.simulation.sourceType,
                undulator_type: appState.models.tabulatedUndulator.undulatorType,
                undulator_period: appState.models.undulator.period / 1000,
                undulator_length: appState.models.undulator.length,
                ebeam: appState.clone(appState.models.electronBeam),
                ebeam_position: appState.clone(appState.models.electronBeamPosition),
            },
            function(data) {
                var ebeam = appState.models.electronBeam;
                ['rmsSizeX', 'rmsDivergX', 'xxprX', 'rmsSizeY', 'rmsDivergY', 'xxprY'].forEach(function(f) {
                    ebeam[f] = formatFloat(data[f]);
                });
                appState.models.electronBeamPosition.drift = data.drift;
            }
        );
    }

    function processFluxAnimation() {
        panelState.enableField('fluxAnimation', 'magneticField', srwService.isTabulatedUndulatorWithMagenticFile());
        if (! srwService.isTabulatedUndulatorWithMagenticFile()) {
            appState.models.fluxAnimation.magneticField = 1;
        }
        // ["-1", "Use Approximate Method"]
        var isApproximateMethod = appState.models.fluxAnimation.method == -1;
        ['initialHarmonic', 'finalHarmonic', 'longitudinalPrecision', 'azimuthalPrecision'].forEach(function(f) {
            panelState.showField('fluxAnimation', f, isApproximateMethod);
        });
        ['precision', 'numberOfMacroElectrons'].forEach(function(f) {
            panelState.showField('fluxAnimation', f, ! isApproximateMethod);
        });
    }

    function processGaussianBeamSize() {
        var energy = appState.models.simulation.photonEnergy;
        var isWaist = appState.models.gaussianBeam.sizeDefinition == 1;
        panelState.enableField('gaussianBeam', 'rmsSizeX', isWaist);
        panelState.enableField('gaussianBeam', 'rmsSizeY', isWaist);
        panelState.enableField('gaussianBeam', 'rmsDivergenceX', ! isWaist);
        panelState.enableField('gaussianBeam', 'rmsDivergenceY', ! isWaist);

        if (isWaist) {
            appState.models.gaussianBeam.rmsDivergenceX = convertGBSize('rmsSizeX', energy);
            appState.models.gaussianBeam.rmsDivergenceY = convertGBSize('rmsSizeY', energy);
        }
        else {
            appState.models.gaussianBeam.rmsSizeX = convertGBSize('rmsDivergenceX', energy);
            appState.models.gaussianBeam.rmsSizeY = convertGBSize('rmsDivergenceY', energy);
        }
    }

    function processIntensityReport(reportName) {
        panelState.showField(reportName, 'fieldUnits', srwService.isGaussianBeam());
        updatePrecisionLabel();
        requestSender.getApplicationData(
            {
                method: 'process_intensity_reports',
                source_type: appState.models.simulation.sourceType,
                undulator_type: appState.models.tabulatedUndulator.undulatorType,
            },
            function(data) {
                appState.models[reportName].magneticField = data.magneticField;
                panelState.enableField(reportName, 'magneticField', false);
            }
        );
    }

    function processTrajectoryReport() {
        if (! srwService.isElectronBeam()) {
            return;
        }
        var isAutomatic = appState.models.trajectoryReport.timeMomentEstimation == 'auto';
        ['initialTimeMoment', 'finalTimeMoment'].forEach(function(f) {
            panelState.showField('trajectoryReport', f, ! isAutomatic);
            if (isAutomatic) {
                appState.models.trajectoryReport[f] = 0;
            }
        });

        if (! srwService.isTabulatedUndulatorWithMagenticFile()) {
            appState.models.trajectoryReport.magneticField = 1;
            panelState.enableField('trajectoryReport', 'magneticField', false);
        }
    }

    function processUndulator() {
        panelState.showRow('undulator', 'horizontalAmplitude', ! srwService.isTabulatedUndulatorWithMagenticFile());
        ['undulatorParameter', 'period', 'length'].forEach(function(f) {
            panelState.showField('undulator', f, ! srwService.isTabulatedUndulatorWithMagenticFile());
        });
        ['gap', 'phase', 'magneticFile', 'indexFileName'].forEach(function(f) {
            panelState.showField('tabulatedUndulator', f, srwService.isTabulatedUndulatorWithMagenticFile());
        });
        // Always hide some fields in the calculator mode:
        if (srwService.isApplicationMode('calculator')) {
            ['longitudinalPosition', 'horizontalSymmetry', 'verticalSymmetry'].forEach(function(f) {
                panelState.showField('undulator', f, false);
            });
        }
    }

    function processUndulatorDefinition(undulatorDefinition) {
        if (! (srwService.isIdealizedUndulator() || srwService.isTabulatedUndulator())) {
            return;
        }
        requestSender.getApplicationData(
            {
                method: 'process_undulator_definition',
                undulator_definition: undulatorDefinition,
                undulator_parameter: appState.models.undulator.undulatorParameter,
                vertical_amplitude: appState.models.undulator.verticalAmplitude,
                undulator_period: appState.models.undulator.period / 1000,
            },
            function(data) {
                if (undulatorDefinition === 'K') {
                    appState.models.undulator.verticalAmplitude = formatFloat(data.vertical_amplitude);
                }
                else {
                    appState.models.undulator.undulatorParameter = formatFloat(data.undulator_parameter);
                }
            }
        );
    }

    function updatePrecisionLabel() {
        if (srwService.isElectronBeam()) {
            var precisionLabel = SIREPO.APP_SCHEMA.model.intensityReport.precision[0];
            if (appState.models.intensityReport.method === "0") {
                precisionLabel = 'Step Size';
            }
            $('.model-intensityReport-precision').find('label').text(precisionLabel);
        }
    }

    function watchModelFields(modelFields, callback) {
        modelFields.forEach(function(f) {
            $scope.$watch('appState.models.' + f, function (newValue, oldValue) {
                if (isReadyForInput && newValue != oldValue) {
                    callback();
                }
            });
        });
    }

    self.handleModalShown = function(name) {
        if (! isReadyForInput) {
            return;
        }
        if (name === 'fluxAnimation') {
            processFluxAnimation();
        }
        else if (name === 'intensityReport') {
            processIntensityReport(name);
        }
        else if (name === 'sourceIntensityReport') {
            panelState.showField(name, 'magneticField', ! srwService.isApplicationMode('calculator'));
            processIntensityReport(name);
            srwService.updateSimulationGridFields();
        }
        else if (name === 'trajectoryReport') {
            processTrajectoryReport();
        }
        else if (name === 'electronBeam') {
            processBeamFields();
        }
        else if (name === 'gaussianBeam') {
            processGaussianBeamSize();
        }
    };

    $scope.$on('modelChanged', function(e, name) {
        if (name == 'simulation') {
            processUndulator();
        }
        else if (name == 'undulator' || name == 'tabulatedUndulator') {
            // make sure the electronBeam.drift is also updated
            appState.saveQuietly('electronBeamPosition');
        }
    });

    watchModelFields(['electronBeam.beamSelector', 'electronBeam.beamDefinition'], processBeamFields);

    watchModelFields(['electronBeam.name'], function() {
        // keep beamSelector in sync with name
        appState.models.electronBeam.beamSelector = appState.models.electronBeam.name;
    });
    watchModelFields(['tabulatedUndulator.name'], function() {
        // keep undulatorSelector in sync with name
        appState.models.tabulatedUndulator.undulatorSelector = appState.models.tabulatedUndulator.name;
    });

    watchModelFields(['electronBeamPosition.driftCalculationMethod'], function() {
        processBeamParameters();
        processBeamFields();
    });

    watchModelFields(['electronBeam.horizontalEmittance', 'electronBeam.horizontalBeta', 'electronBeam.horizontalAlpha', 'electronBeam.horizontalDispersion', 'electronBeam.horizontalDispersionDerivative', 'electronBeam.verticalEmittance', 'electronBeam.verticalBeta', 'electronBeam.verticalAlpha', 'electronBeam.verticalDispersion', 'electronBeam.verticalDispersionDerivative'], processBeamParameters);

    watchModelFields(['fluxAnimation.method'], processFluxAnimation);

    watchModelFields(['gaussianBeam.sizeDefinition', 'gaussianBeam.rmsSizeX', 'gaussianBeam.rmsSizeY', 'gaussianBeam.rmsDivergenceX', 'gaussianBeam.rmsDivergenceY', 'simulation.photonEnergy'], function() {
        if (srwService.isGaussianBeam()) {
            processGaussianBeamSize();
        }
    });

    watchModelFields(['intensityReport.method'], updatePrecisionLabel);

    watchModelFields(['tabulatedUndulator.undulatorType', 'undulator.length', 'undulator.period', 'simulation.sourceType'], processBeamParameters);

    watchModelFields(['tabulatedUndulator.undulatorType'], processUndulator);

    watchModelFields(['tabulatedUndulator.magneticFile'], function() {
        requestSender.getApplicationData(
            {
                method: 'compute_undulator_length',
                tabulated_undulator: appState.models.tabulatedUndulator,
            },
            function(data) {
                appState.models.tabulatedUndulator.length = data.length;
            }
        );
    });

    watchModelFields(['trajectoryReport.timeMomentEstimation'], function() {
        processTrajectoryReport();
    });

    watchModelFields(['undulator.undulatorParameter'], function() {
        if (isActiveField('undulator', 'undulatorParameter')) {
            processUndulatorDefinition('K');
        }
    });

    watchModelFields(['undulator.verticalAmplitude', 'undulator.period'], function() {
        if (! isActiveField('undulator', 'undulatorParameter')) {
            processUndulatorDefinition('B');
        }
    });

    appState.whenModelsLoaded($scope, function() {
        //TODO(pjm): move isReadyForInput to panelState
        $document.ready(function() {
            isReadyForInput = true;
            disableBasicEditorBeamName();
            processUndulator();
        });
    });
});

SIREPO.app.directive('appFooter', function(appState, srwService) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appFooter',
        },
        template: [
            '<div data-delete-simulation-modal="nav"></div>',
            '<div data-reset-simulation-modal="nav"></div>',
            '<div data-modal-editor="" view-name="simulationGrid" data-parent-controller="nav"></div>',
            '<div data-modal-editor="" view-name="simulationDocumentation"></div>',
            '<div data-import-python=""></div>',
        ].join(''),
        controller: function($scope) {
            $scope.appState = appState;
            // hook for sampling method changes
            $scope.nav.handleModalShown = srwService.updateSimulationGridFields;
            $scope.$watch('appState.models.simulation.samplingMethod', srwService.updateSimulationGridFields);
        },
    };
});

SIREPO.app.directive('appHeader', function(appState, panelState, requestSender, srwService, $location, $window) {

    var settingsIcon = [
        '<li class="dropdown"><a href class="dropdown-toggle hidden-xs" data-toggle="dropdown"><span class="glyphicon glyphicon-cog"></span> <span class="caret"></span></a>',
          '<ul class="dropdown-menu">',
            '<li data-ng-if="! srwService.isApplicationMode(\'calculator\')"><a href data-ng-click="showSimulationGrid()"><span class="glyphicon glyphicon-th"></span> Initial Wavefront Simulation Grid</a></li>',
            '<li data-ng-if="srwService.isApplicationMode(\'default\')"><a href data-ng-click="showDocumentationUrl()"><span class="glyphicon glyphicon-book"></span> Simulation Documentation URL</a></li>',
            '<li><a href data-ng-click="jsonDataFile()"><span class="glyphicon glyphicon-cloud-download"></span> Export JSON Data File</a></li>',
            '<li data-ng-if="canCopy()"><a href data-ng-click="copy()"><span class="glyphicon glyphicon-copy"></span> Open as a New Copy</a></li>',
            '<li data-ng-if="isExample()"><a href data-target="#srw-reset-confirmation" data-toggle="modal"><span class="glyphicon glyphicon-repeat"></span> Discard Changes to Example</a></li>',
            '<li data-ng-if="! isExample()"><a href data-target="#srw-delete-confirmation" data-toggle="modal""><span class="glyphicon glyphicon-trash"></span> Delete</a></li>',
            '<li data-ng-if="hasRelatedSimulations()" class="divider"></li>',
            '<li data-ng-if="hasRelatedSimulations()" class="s-dropdown-submenu">',
              '<a href><span class="glyphicon glyphicon-chevron-left"></span> Related Simulations</a>',
        '<ul class="dropdown-menu">',
        '<li data-ng-repeat="item in relatedSimulations"><a href data-ng-click="openRelatedSimulation(item)">{{ item.name }}</a></li>',
        '</ul>',
            '</li>',
          '</ul>',
        '</li>',
    ].join('');

    var rightNav = [
        '<ul class="nav navbar-nav navbar-right" data-login-menu="" data-ng-if="srwService.isApplicationMode(\'default\')"></ul>',
        '<ul class="nav navbar-nav navbar-right" data-ng-show="nav.isActive(\'simulations\') && ! srwService.isApplicationMode(\'light-sources\')">',
          '<li><a href data-ng-click="showSimulationModal()"><span class="glyphicon glyphicon-plus s-small-icon"></span><span class="glyphicon glyphicon-file"></span> New Simulation</a></li>',
          '<li><a href data-ng-click="showNewFolderModal()"><span class="glyphicon glyphicon-plus s-small-icon"></span><span class="glyphicon glyphicon-folder-close"></span> New Folder</a></li>',
          '<li><a href data-ng-click="showImportModal()"><span class="glyphicon glyphicon-cloud-upload"></span> Import</a></li>',
        '</ul>',
        '<ul class="nav navbar-nav navbar-right" data-ng-show="isLoaded()">',
          '<li data-ng-class="{active: nav.isActive(\'source\')}"><a href data-ng-click="nav.openSection(\'source\')"><span class="glyphicon glyphicon-flash"></span> Source</a></li>',
          '<li data-ng-class="{active: nav.isActive(\'beamline\')}"><a href data-ng-click="nav.openSection(\'beamline\')"><span class="glyphicon glyphicon-option-horizontal"></span> Beamline</a></li>',
          '<li data-ng-if="hasDocumentationUrl()"><a href data-ng-click="openDocumentation()"><span class="glyphicon glyphicon-book"></span> Notes</a></li>',
          settingsIcon,
        '</ul>',
    ].join('');

    function navHeader(mode, modeTitle, $window) {
        return [
            '<div class="navbar-header">',
              '<a class="navbar-brand" href="/#about"><img style="width: 40px; margin-top: -10px;" src="/static/img/radtrack.gif" alt="radiasoft"></a>',
              '<div class="navbar-brand"><a href="/light">Synchrotron Radiation Workshop</a>',
                '<span class="hidden-xs"> - </span>',
                '<a class="hidden-xs" href="/light#/' + mode + '" class="hidden-xs">' + modeTitle + '</a>',
                '<span class="hidden-xs" data-ng-if="nav.sectionTitle()"> - </span>',
                '<span class="hidden-xs" data-ng-bind="nav.sectionTitle()"></span>',
              '</div>',
            '</div>',
            mode == 'light-sources'
                ? [
                    '<ul class="nav navbar-nav">',
                      '<li data-ng-class="{active: nav.isActive(\'simulations\')}"><a href data-ng-click="nav.openSection(\'simulations\')"><span class="glyphicon glyphicon-th-list"></span> Simulations</a></li>',
                    '</ul>',
                ].join('')
                : '',
        ].join('');
    }

    return {
        restrict: 'A',
        scope: {
            nav: '=appHeader',
        },
        template: [
            '<div data-ng-if="srwService.isApplicationMode(\'calculator\')">',
              navHeader('calculator', 'SR Calculator'),
              '<ul data-ng-if="isLoaded()" class="nav navbar-nav navbar-right">',
                settingsIcon,
              '</ul>',
              '<ul class="nav navbar-nav navbar-right" data-ng-show="isLoaded()">',
                '<li data-ng-if="hasDocumentationUrl()"><a href data-ng-click="openDocumentation()"><span class="glyphicon glyphicon-book"></span> Notes</a></li>',
              '</ul>',
            '</div>',
            '<div data-ng-if="srwService.isApplicationMode(\'wavefront\')">',
              navHeader('wavefront', 'Wavefront Propagation'),
              rightNav,
            '</div>',
            '<div data-ng-if="srwService.isApplicationMode(\'light-sources\')">',
              navHeader('light-sources', 'Light Source Facilities'),
              rightNav,
            '</div>',
            '<div data-ng-if="srwService.isApplicationMode(\'default\')">',
              '<div class="navbar-header">',
                '<a class="navbar-brand" href="/#about"><img style="width: 40px; margin-top: -10px;" src="/static/img/radtrack.gif" alt="radiasoft"></a>',
                '<div class="navbar-brand"><a href="/light">Synchrotron Radiation Workshop</a></div>',
              '</div>',
              '<div class="navbar-left" data-app-header-left="nav"></div>',
              rightNav,
            '</div>',
        ].join(''),
        controller: function($scope) {
            var currentSimulationId = null;

            function simulationId() {
                return appState.models.simulation.simulationId;
            }

            $scope.srwService = srwService;
            $scope.relatedSimulations = [];

            $scope.canCopy = function() {
                if (srwService.applicationMode == 'calculator' || srwService.applicationMode == 'wavefront') {
                    return false;
                }
                return true;
            };

            $scope.copy = function() {
                appState.copySimulation(
                    simulationId(),
                    function(data) {
                        requestSender.localRedirect('source', {
                            ':simulationId': data.models.simulation.simulationId,
                        });
                    });
            };

            $scope.jsonDataFile = function(item) {
                $window.open(requestSender.formatUrl('simulationData', {
                    '<simulation_id>': simulationId(),
                    '<simulation_type>': SIREPO.APP_SCHEMA.simulationType,
                    '<pretty>': true,
                }), '_blank');
            };

            $scope.hasDocumentationUrl = function() {
                if (appState.isLoaded()) {
                    return appState.models.simulation.documentationUrl;
                }
                return false;
            };

            $scope.hasRelatedSimulations = function() {
                if (appState.isLoaded()) {
                    if (currentSimulationId == appState.models.simulation.simulationId) {
                        return $scope.relatedSimulations.length > 0;
                    }
                    currentSimulationId = appState.models.simulation.simulationId;
                    requestSender.sendRequest(
                        'listSimulations',
                        function(data) {
                            for (var i = 0; i < data.length; i++) {
                                var item = data[i];
                                if (item.simulationId == currentSimulationId) {
                                    data.splice(i, 1);
                                    break;
                                }
                            }
                            $scope.relatedSimulations = data;
                        },
                        {
                            simulationType: SIREPO.APP_SCHEMA.simulationType,
                            search: {
                                'simulation.folder': appState.models.simulation.folder,
                            },
                        });
                }
                return false;
            };

            $scope.isExample = function() {
                if (appState.isLoaded()) {
                    return appState.models.simulation.isExample;
                }
                return false;
            };

            $scope.isLoaded = function() {
                if ($scope.nav.isActive('simulations')) {
                    return false;
                }
                return appState.isLoaded();
            };

            $scope.openDocumentation = function() {
                $window.open(appState.models.simulation.documentationUrl, '_blank');
            };

            $scope.openRelatedSimulation = function(item) {
                if ($scope.nav.isActive('beamline')) {
                    requestSender.localRedirect('beamline', {
                        ':simulationId': item.simulationId,
                    });
                    return;
                }
                requestSender.localRedirect('source', {
                    ':simulationId': item.simulationId,
                });
            };

            $scope.showImportModal = function() {
                $('#srw-simulation-import').modal('show');
            };

            $scope.showNewFolderModal = function() {
                panelState.showModalEditor('simulationFolder');
            };

            $scope.showSimulationModal = function() {
                panelState.showModalEditor('simulation');
            };

            $scope.showDocumentationUrl = function() {
                panelState.showModalEditor('simulationDocumentation');
            };

            $scope.showSimulationGrid = function() {
                panelState.showModalEditor('simulationGrid');
            };
        },
    };
});

SIREPO.app.directive('beamlineIcon', function() {
    return {
        scope: {
            item: '=',
        },
        template: [
            '<svg class="srw-beamline-item-icon" viewbox="0 0 50 60" data-ng-switch="item.type">',
              '<g data-ng-switch-when="lens">',
                '<path d="M25 0 C30 10 30 50 25 60" class="srw-lens" />',
                '<path d="M25 60 C20 50 20 10 25 0" class="srw-lens" />',
              '</g>',
              '<g data-ng-switch-when="aperture">',
                '<rect x="23", y="0", width="5", height="24" class="srw-aperture" />',
                '<rect x="23", y="36", width="5", height="24" class="srw-aperture" />',
              '</g>',
              '<g data-ng-switch-when="ellipsoidMirror">',
                '<path d="M20 0 C30 10 30 50 20 60" class="srw-mirror" />',
              '</g>',
              '<g data-ng-switch-when="grating">',
                '<polygon points="24,0 20,15, 24,17 20,30 24,32 20,45 24,47 20,60 24,60 28,60 28,0" class="srw-mirror" />',
              '</g>',
              '<g data-ng-switch-when="mirror">',
                '<rect x="23" y="0" width="5", height="60" class="srw-mirror" />',
              '</g>',
              '<g data-ng-switch-when="sphericalMirror">',
                '<path d="M20 0 C30 10 30 50 20 60 L33 60 L33 0 L20 0" class="srw-mirror" />',
              '</g>',
              '<g data-ng-switch-when="obstacle">',
                '<rect x="15" y="20" width="20", height="20" class="srw-obstacle" />',
              '</g>',
              '<g data-ng-switch-when="crl">',
                '<rect x="15", y="0", width="20", height="60" class="srw-crl" />',
                '<path d="M25 0 C30 10 30 50 25 60" class="srw-lens" />',
                '<path d="M25 60 C20 50 20 10 25 0" class="srw-lens" />',
                '<path d="M15 0 C20 10 20 50 15 60" class="srw-lens" />',
                '<path d="M15 60 C10 50 10 10 15 0" class="srw-lens" />',
                '<path d="M35 0 C40 10 40 50 35 60" class="srw-lens" />',
                '<path d="M35 60 C30 50 30 10 35 0" class="srw-lens" />',
              '</g>',
              '<g data-ng-switch-when="crystal">',
                '<rect x="8" y="25" width="50", height="6" class="srw-crystal" transform="translate(0) rotate(-30 50 50)" />',
              '</g>',
              '<g data-ng-switch-when="fiber" transform="translate(0) rotate(20 20 40)">',
                '<path d="M-10,35 L10,35" class="srw-fiber"/>',
                '<ellipse cx="10" cy="35" rx="3" ry="5" class="srw-fiber" />',
                '<path d="M10,30 L40,29 40,41 L10,40" class="srw-fiber"/>',
                '<ellipse cx="40" cy="35" rx="3"  ry="6" class="srw-fiber-right" />',
                '<path d="M40,35 L60,35" class="srw-fiber"/>',
              '</g>',
              '<g data-ng-switch-when="mask">',
                '<rect x="2" y="10" width="60", height="60" />',
                '<circle cx="11" cy="20" r="2" class="srw-mask" />',
                '<circle cx="21" cy="20" r="2" class="srw-mask" />',
                '<circle cx="31" cy="20" r="2" class="srw-mask" />',
                '<circle cx="41" cy="20" r="2" class="srw-mask" />',
                '<circle cx="11" cy="30" r="2" class="srw-mask" />',
                '<circle cx="21" cy="30" r="2" class="srw-mask" />',
                '<circle cx="31" cy="30" r="2" class="srw-mask" />',
                '<circle cx="41" cy="30" r="2" class="srw-mask" />',
                '<circle cx="11" cy="40" r="2" class="srw-mask" />',
                '<circle cx="21" cy="40" r="2" class="srw-mask" />',
                '<circle cx="31" cy="40" r="2" class="srw-mask" />',
                '<circle cx="41" cy="40" r="2" class="srw-mask" />',
                '<circle cx="11" cy="50" r="2" class="srw-mask" />',
                '<circle cx="21" cy="50" r="2" class="srw-mask" />',
                '<circle cx="31" cy="50" r="2" class="srw-mask" />',
                '<circle cx="41" cy="50" r="2" class="srw-mask" />',
              '</g>',
              '<g data-ng-switch-when="watch">',
                '<path d="M5 30 C 15 45 35 45 45 30" class="srw-watch" />',
                '<path d="M45 30 C 35 15 15 15 5 30" class="srw-watch" />',
                '<circle cx="25" cy="30" r="10" class="srw-watch" />',
                '<circle cx="25" cy="30" r="4" class="srw-watch-pupil" />',
              '</g>',
              '<g data-ng-switch-when="sample">',
                '<rect x="2" y="10" width="60", height="60" />',
                '<circle cx="26" cy="35" r="18" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="16" class="srw-sample-black" />',
                '<circle cx="26" cy="35" r="14" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="12" class="srw-sample-black" />',
                '<circle cx="26" cy="35" r="10" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="8" class="srw-sample-black" />',
                '<circle cx="26" cy="35" r="6" class="srw-sample-white" />',
                '<circle cx="26" cy="35" r="4" class="srw-sample-black" />',
              '</g>',
            '</svg>',
        ].join(''),
    };
});

SIREPO.app.directive('beamlineItem', function($timeout) {
    return {
        scope: {
            item: '=',
        },
        template: [
            '<span class="srw-beamline-badge badge">{{ item.position }}m</span>',
            '<span data-ng-if="showItemButtons()" data-ng-click="removeElement(item)" class="srw-beamline-close-icon glyphicon glyphicon-remove-circle" title="Delete Element"></span>',
            '<span data-ng-if="showItemButtons()" data-ng-click="toggleDisableElement(item)" class="srw-beamline-disable-icon glyphicon glyphicon-off" title="Disable Element"></span>',
            '<div class="srw-beamline-image">',
              '<span data-beamline-icon="", data-item="item"></span>',
            '</div>',
            '<div data-ng-attr-id="srw-item-{{ item.id }}" class="srw-beamline-element-label">{{ item.title }}<span class="caret"></span></div>',
        ].join(''),
        controller: function($scope) {
            $scope.removeElement = function(item) {
                $scope.$parent.beamline.removeElement(item);
            };
            $scope.showItemButtons = function() {
                return $scope.$parent.beamline.isDefaultMode();
            };
            $scope.toggleDisableElement = function(item) {
                if (item.isDisabled) {
                    delete item.isDisabled;
                }
                else {
                    item.isDisabled = true;
                }
            };
        },
        link: function(scope, element) {
            var el = $(element).find('.srw-beamline-element-label');
            el.on('click', togglePopover);
            el.popover({
                trigger: 'manual',
                html: true,
                placement: 'bottom',
                container: '.srw-popup-container-lg',
                viewport: { selector: '.srw-beamline'},
                content: $('#srw-' + scope.item.type + '-editor'),
            }).on('show.bs.popover', function() {
                $('.srw-beamline-element-label').not(el).popover('hide');
                scope.$parent.beamline.setActiveItem(scope.item);
            }).on('shown.bs.popover', function() {
                $('.popover-content .form-control').first().select();
            }).on('hide.bs.popover', function() {
                scope.$parent.beamline.setActiveItem(null);
                var editor = el.data('bs.popover').getContent();
                // return the editor to the editor-holder so it will be available for the
                // next element of this type
                if (editor) {
                    $('.srw-editor-holder').trigger('s.resetActivePage');
                    $('.srw-editor-holder').append(editor);
                }
            });

            function togglePopover() {
                el.popover('toggle');
                scope.$apply();
            }
            if (scope.$parent.beamline.isTouchscreen()) {
                var hasTouchMove = false;
                $(element).bind('touchstart', function() {
                    hasTouchMove = false;
                });
                $(element).bind('touchend', function() {
                    if (! hasTouchMove) {
                        togglePopover();
                    }
                    hasTouchMove = false;
                });
                $(element).bind('touchmove', function() {
                    hasTouchMove = true;
                });
            }
            else {
                $(element).find('.srw-beamline-image').click(function() {
                    togglePopover();
                });
            }
            if (scope.item.showPopover) {
                delete scope.item.showPopover;
                // when the item is added, it may have been dropped between items
                // don't show the popover until the position has been determined
                $timeout(function() {
                    var position = el.parent().position().left;
                    var width = $('.srw-beamline-container').width();
                    var itemWidth = el.width();
                    if (position + itemWidth > width) {
                        var scrollPoint = $('.srw-beamline-container').scrollLeft();
                        $('.srw-beamline-container').scrollLeft(position - width + scrollPoint + itemWidth);
                    }
                    el.popover('show');
                }, 500);
            }
            scope.$on('$destroy', function() {
                if (scope.$parent.beamline.isTouchscreen()) {
                    $(element).bind('touchstart', null);
                    $(element).bind('touchend', null);
                    $(element).bind('touchmove', null);
                }
                else {
                    $(element).find('.srw-beamline-image').off();
                    $(element).off();
                }
                var el = $(element).find('.srw-beamline-element-label');
                el.off();
                var popover = el.data('bs.popover');
                // popover has a memory leak with $tip user_data which needs to be cleaned up manually
                if (popover && popover.$tip) {
                    popover.$tip.removeData('bs.popover');
                }
                el.popover('destroy');
            });
        },
    };
});

SIREPO.app.directive('beamlineItemEditor', function(appState) {
    return {
        scope: {
            modelName: '@',
        },
        template: [
            '<div>',
              '<div data-help-button="{{ title }}"></div>',
              '<form name="form" class="form-horizontal" novalidate>',
                '<div data-advanced-editor-pane="" data-view-name="modelName" data-model-data="modelAccess"></div>',
                '<div class="form-group">',
                  '<div class="col-sm-offset-6 col-sm-3">',
                    '<button ng-click="beamline.dismissPopup()" style="width: 100%" type="submit" class="btn btn-primary" data-ng-class="{\'disabled\': ! form.$valid}">Close</button>',
                  '</div>',
                '</div>',
                '<div class="form-group" data-ng-show="beamline.isTouchscreen() && beamline.isDefaultMode()">',
                  '<div class="col-sm-offset-6 col-sm-3">',
                    '<button ng-click="removeActiveItem()" style="width: 100%" type="submit" class="btn btn-danger">Delete</button>',
                  '</div>',
                '</div>',
              '</form>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.beamline = $scope.$parent.beamline;
            $scope.title = appState.viewInfo($scope.modelName).title;
            $scope.advancedFields = appState.viewInfo($scope.modelName).advanced;
            $scope.removeActiveItem = function() {
                $scope.beamline.removeElement($scope.beamline.activeItem);
            };
            $scope.modelAccess = {
                modelKey: $scope.modelName,
                getData: function() {
                    return $scope.beamline.activeItem;
                },
            };
            //TODO(pjm): investigate why id needs to be set in html for revisiting the beamline page
            //$scope.editorId = 'srw-' + $scope.modelName + '-editor';
        },
    };
});

SIREPO.app.directive('deleteSimulationModal', function(appState, $location) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div data-confirmation-modal="" data-id="srw-delete-confirmation" data-title="Delete Simulation?" data-ok-text="Delete" data-ok-clicked="deleteSimulation()">Delete simulation &quot;{{ simulationName() }}&quot;?</div>',
        ].join(''),
        controller: function($scope) {
            $scope.deleteSimulation = function() {
                appState.deleteSimulation(
                    appState.models.simulation.simulationId,
                    function() {
                        $location.path('/simulations');
                    });
            };
            $scope.simulationName = function() {
                if (appState.isLoaded()) {
                    return appState.models.simulation.name;
                }
                return '';
            };
        },
    };
});

//TODO(pjm): refactor and generalize with mirrorUpload
SIREPO.app.directive('importPython', function(appState, fileUpload, requestSender) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div class="modal fade" id="srw-simulation-import" tabindex="-1" role="dialog">',
              '<div class="modal-dialog modal-lg">',
                '<div class="modal-content">',
                  '<div class="modal-header bg-info">',
                    '<button type="button" class="close" data-dismiss="modal"><span>&times;</span></button>',
                    '<div data-help-button="{{ title }}"></div>',
                    '<span class="lead modal-title text-info">{{ title }}</span>',
                  '</div>',
                  '<div class="modal-body">',
                    '<div class="container-fluid">',
                      '<form name="importForm">',
                        '<div class="form-group">',
                          '<label>Select File</label>',
                          '<input id="srw-python-file-import" type="file" data-file-model="pythonFile">',
                          '<div data-ng-if="fileType(pythonFile)"></div>',
                          '<br />',
                          '<div class="srw-python-file-import-args"><label>Optional arguments:</label><input type="text" style="width: 100%" data-ng-model="importArgs"></div><br>',
                          '<div class="text-warning"><strong>{{ fileUploadError }}</strong></div>',
                        '</div>',
                        '<div data-ng-if="isUploading" class="col-sm-6 pull-right">Please Wait...</div>',
                        '<div class="clearfix"></div>',
                        '<div class="col-sm-6 pull-right">',
                          '<button data-ng-click="importPythonFile(pythonFile, importArgs)" class="btn btn-primary" data-ng-class="{\'disabled\': isUploading}">Import File</button>',
                          ' <button data-dismiss="modal" class="btn btn-default" data-ng-class="{\'disabled\': isUploading}">Cancel</button>',
                        '</div>',
                      '</form>',
                    '</div>',
                  '</div>',
                '</div>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.fileUploadError = '';
            $scope.isUploading = false;
            $scope.title = 'Import Python or JSON Simulation File';
            var import_args = $('.srw-python-file-import-args');
            import_args.hide();
            $scope.fileType = function(pythonFile) {
                if (typeof(pythonFile) === 'undefined') {
                    return;
                }
                if (pythonFile.name.search('.py') >= 0) {
                    import_args.show();
                }
                else {
                    import_args.hide();
                }
            };
            $scope.importPythonFile = function(pythonFile, importArgs) {
                if (typeof(importArgs) === 'undefined') {
                    importArgs = '';
                }
                if (! pythonFile) {
                    return;
                }
                $scope.isUploading = true;
                fileUpload.uploadFileToUrl(
                    pythonFile,
                    {
                        folder: appState.getActiveFolderPath(),
                        arguments: importArgs,
                    },
                    requestSender.formatUrl(
                        'importFile',
                        {
                            '<simulation_type>': SIREPO.APP_SCHEMA.simulationType,
                        }),
                    function(data) {
                        $scope.isUploading = false;
                        if (data.error) {
                            $scope.fileUploadError = data.error;
                        }
                        else {
                            $('#srw-simulation-import').modal('hide');
                            requestSender.localRedirect('source', {
                                ':simulationId': data.models.simulation.simulationId,
                            });
                        }
                    });
            };
        },
        link: function(scope, element) {
            $(element).on('show.bs.modal', function() {
                $('#srw-python-file-import').val(null);
                scope.fileUploadError = '';
            });
            scope.$on('$destroy', function() {
                $(element).off();
            });
        },
    };
});

SIREPO.app.directive('mobileAppTitle', function(srwService) {
    function mobileTitle(mode, modeTitle) {
        return [
            '<div data-ng-if="srwService.isApplicationMode(\'' + mode + '\')" class="row visible-xs">',
              '<div class="col-xs-12 lead text-center">',
                '<a href="/light#/' + mode + '">' + modeTitle + '</a>',
                ' - {{ nav.sectionTitle() }}',
              '</div>',
            '</div>',
        ].join('');
    }

    return {
        restrict: 'A',
        scope: {
            nav: '=mobileAppTitle',
        },
        template: [
            mobileTitle('calculator', 'SR Calculator'),
            mobileTitle('wavefront', 'Wavefront Propagation'),
            mobileTitle('light-sources', 'Light Source Facilities'),
        ].join(''),
        controller: function($scope) {
            $scope.srwService = srwService;
        },
    };
});

SIREPO.app.directive('modelSelectionList', function(appState, requestSender) {
    return {
        restrict: 'A',
        scope: {
            modelName: '=',
            model: '=',
            field: '=',
            fieldClass: '=',
        },
        template: [
            '<div class="dropdown" data-ng-class="fieldClass">',
              '<button style="display: inline-block" class="btn btn-default dropdown-toggle form-control" type="button" data-toggle="dropdown">{{ model[field] }} <span class="caret"></span></button>',
              '<ul class="dropdown-menu" style="margin-left: 15px">',
                '<li data-ng-if="isElectronBeam()" class="dropdown-header">Predefined Electron Beams</li>',
                '<li data-ng-repeat="item in modelList | orderBy:\'name\' track by item.name">',
                  '<a href data-ng-click="selectItem(item)">{{ item.name }}</a>',
                '</li>',
                '<li data-ng-if="isElectronBeam() && userModelList.length" class="divider"></li>',
                '<li data-ng-if="isElectronBeam() && userModelList.length" class="dropdown-header">User Defined Electron Beams</li>',
                '<li data-ng-repeat="item in userModelList | orderBy:\'name\' track by item.id" class="s-model-list-item">',
                  '<a href data-ng-click="selectItem(item)">{{ item.name }}<span data-ng-show="! isSelectedItem(item)" data-ng-click="deleteItem(item, $event)" class="glyphicon glyphicon-remove"></span></a>',
                '</li>',
                '<li data-ng-if="! isElectronBeam() && userModelList.length" class="divider"></li>',
                '<li><a href data-ng-if="! isElectronBeam()" data-ng-click="addNewUndulator()"><span class="glyphicon glyphicon-plus"></span> Add New</a></li>',
              '</ul>',
            '</div>',
            '<div class="col-sm-2" data-ng-if="model.isReadOnly">',
              '<div class="form-control-static"><a href data-ng-click="editItem()">Edit Beam</a></div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.appState = appState;

            function newModelId() {
                return appState.uniqueName($scope.userModelList, 'id', appState.models.simulation.simulationId + ' {}');
            }

            $scope.addNewUndulator = function() {
                ['tabulatedUndulator', 'undulator'].forEach(function(name) {
                    appState.models[name] = appState.clone(appState.models[name]);
                });
                appState.models.tabulatedUndulator.id = newModelId();
                appState.models.tabulatedUndulator.name = '';
                appState.models.undulatorSelector = '';
                //TODO(pjm): add panelState.setFocus(model, field)
                $('.model-tabulatedUndulator-name .form-control').first().select();
            };
            $scope.editItem = function() {
                // copy the current model, rename and show editor
                var newModel = appState.clone(appState.models[$scope.modelName]);
                delete newModel.isReadOnly;
                newModel.name = appState.uniqueName($scope.userModelList, 'name', newModel.name + ' (copy {})');
                if ($scope.isElectronBeam()) {
                    newModel.beamSelector = newModel.name;
                }
                else {
                    newModel.undulatorSelector = newModel.name;
                }
                newModel.id = newModelId();
                appState.models[$scope.modelName] = newModel;
            };
            $scope.deleteItem = function(item, $event) {
                $event.stopPropagation();
                $event.preventDefault();
                requestSender.getApplicationData(
                    {
                        method: 'delete_user_models',
                        electron_beam: $scope.isElectronBeam() ? item : null,
                        tabulated_undulator: $scope.isElectronBeam() ? null : item,
                    },
                    $scope.loadModelList);
            };
            $scope.isElectronBeam = function() {
                return $scope.modelName == 'electronBeam';
            };
            $scope.isSelectedItem = function(item) {
                return item.id == appState.models[$scope.modelName].id;
            };
            $scope.loadModelList = function() {
                requestSender.getApplicationData(
                    {
                        method: 'model_list',
                        model_name: $scope.modelName,
                    },
                    function(data) {
                        $scope.modelList = [];
                        $scope.userModelList = [];
                        if (appState.isLoaded() && data.modelList) {
                            for (var i = 0; i < data.modelList.length; i++) {
                                var model = data.modelList[i];
                                (model.isReadOnly
                                 ? $scope.modelList
                                 : $scope.userModelList
                                ).push(model);
                            }
                        }
                    });
            };
            $scope.selectItem = function(item) {
                item = appState.clone(item);
                appState.models[$scope.modelName] = item;
                item[$scope.field] = item.name;
                if (! $scope.isElectronBeam()) {
                    appState.models.undulator = item.undulator;
                }
            };
        },
        link: function link(scope, element) {
            scope.loadModelList();
            scope.$on('modelChanged', function(e, name) {
                if (name != scope.modelName) {
                    return;
                }
                var model = appState.models[scope.modelName];
                if (model.isReadOnly) {
                    return;
                }
                var foundIt = false;
                model = appState.clone(model);
                if (! scope.isElectronBeam()) {
                    model.undulator = appState.clone(appState.models.undulator);
                }
                for (var i = 0; i < scope.userModelList.length; i++) {
                    if (scope.userModelList[i].id == model.id) {
                        scope.userModelList[i] = model;
                        foundIt = true;
                        break;
                    }
                }
                if (! foundIt) {
                    scope.userModelList.push(model);
                }
            });
        },
    };
});

SIREPO.app.directive('resetSimulationModal', function(appState, requestSender, srwService) {
    return {
        restrict: 'A',
        scope: {
            nav: '=resetSimulationModal',
        },
        template: [
            '<div data-confirmation-modal="" data-id="srw-reset-confirmation" data-title="Reset Simulation?" data-ok-text="Discard Changes" data-ok-clicked="revertToOriginal()">Discard changes to &quot;{{ simulationName() }}&quot;?</div>',
        ].join(''),
        controller: function($scope) {
            function revertSimulation() {
                $scope.nav.revertToOriginal(
                    srwService.applicationMode,
                    appState.models.simulation.name);
            }

            $scope.revertToOriginal = function() {
                // delete the user-defined models first
                requestSender.getApplicationData(
                    {
                        method: 'delete_user_models',
                        electron_beam: appState.models.electronBeam,
                        tabulated_undulator: appState.models.tabulatedUndulator,
                    },
                    revertSimulation);
            };
            $scope.simulationName = function() {
                if (appState.isLoaded()) {
                    return appState.models.simulation.name;
                }
                return '';
            };
        },
    };
});

SIREPO.app.directive('simulationStatusPanel', function(frameCache, persistentSimulation) {
    return {
        restrict: 'A',
        scope: {
            model: '@simulationStatusPanel',
            title: '@',
        },
        template: [
            '<form name="form" class="form-horizontal" novalidate>',
              '<div class="progress" data-ng-if="isStateProcessing()">',
                '<div class="progress-bar" data-ng-class="{ \'progress-bar-striped active\': isInitializing() }" role="progressbar" aria-valuenow="{{ displayPercentComplete() }}" aria-valuemin="0" aria-valuemax="100" data-ng-attr-style="width: {{ displayPercentComplete() }}%"></div>',
              '</div>',

              '<div data-ng-if="isStateProcessing()">',
                '<div class="col-sm-6">',
                  '<div data-ng-show="isStatePending()">',
                    '<span class="glyphicon glyphicon-hourglass"></span> {{ stateAsText() }} {{ dots }}',
                  '</div>',
                  '<div data-ng-show="isInitializing()">',
                    '<span class="glyphicon glyphicon-hourglass"></span> Initializing Simulation {{ dots }}',
                  '</div>',
                  '<div data-ng-show="isStateRunning() && ! isInitializing()">',
                    '{{ stateAsText() }} {{ dots }}',
                    '<div data-ng-show="! isStatePending() && particleNumber">',
                      'Completed particle: {{ particleNumber }} / {{ particleCount}}',
                    '</div>',
                    '<div data-simulation-status-timer="timeData"></div>',
                  '</div>',
                '</div>',
                '<div class="col-sm-6 pull-right">',
                  '<button class="btn btn-default" data-ng-click="cancelSimulation()">End Simulation</button>',
                '</div>',
              '</div>',
              '<div data-ng-show="isStateStopped()">',
                '<div class="col-sm-6">',
                  'Simulation ',
                  '<span>{{ stateAsText() }}</span>',
                  '<div data-ng-show="! isStatePending() && ! isInitializing() && particleNumber">',
                    'Completed particle: {{ particleNumber }} / {{ particleCount}}',
                  '</div>',
                  '<div>',
                    '<div data-simulation-status-timer="timeData"></div>',
                  '</div>',
                '</div>',
                '<div class="col-sm-6 pull-right">',
                  '<button class="btn btn-default" data-ng-click="runSimulation()">Start New Simulation</button>',
                '</div>',
              '</div>',
            '</form>',
        ].join(''),
        controller: function($scope) {
            $scope.displayPercentComplete = function() {
                if ($scope.isInitializing() || $scope.isStatePending()) {
                    return 100;
                }
                return $scope.percentComplete;
            };
            $scope.handleStatus = function(data) {
                if (data.percentComplete) {
                    $scope.percentComplete = data.percentComplete;
                    $scope.particleNumber = data.particleNumber;
                    $scope.particleCount = data.particleCount;
                }
                if (data.frameId && (data.frameId != $scope.frameId)) {
                    $scope.frameId = data.frameId;
                    $scope.frameCount++;
                    frameCache.setFrameCount($scope.frameCount);
                    frameCache.setCurrentFrame($scope.model, $scope.frameCount - 1);
                }
            };

            persistentSimulation.initProperties($scope);
            frameCache.setAnimationArgs({
                multiElectronAnimation: [],
                fluxAnimation: ['fluxType'],
            });
            $scope.$on($scope.model + '.changed', function() {
                if ($scope.isReadyForModelChanges) {
                    frameCache.setFrameCount(0);
                    frameCache.clearFrames($scope.model);
                    $scope.percentComplete = 0;
                    $scope.particleNumber = 0;
                }
            });
            $scope.persistentSimulationInit($scope);
        },
    };
});

SIREPO.app.directive('tooltipEnabler', function() {
    return {
        link: function(scope, element) {
            $('[data-toggle="tooltip"]').tooltip({
                html: true,
                placement: 'bottom',
            });
            scope.$on('$destroy', function() {
                $('[data-toggle="tooltip"]').tooltip('destroy');
            });
        },
    };
});

SIREPO.app.directive('watchpointModalEditor', function(srwService) {
    return {
        scope: {
            parentController: '=',
            itemId: '=',
        },
        template: [
            '<div data-modal-editor="" view-name="watchpointReport" data-parent-controller="parentController" data-model-data="modelAccess" data-modal-title="reportTitle()"></div>',
        ].join(''),
        controller: function($scope) {
            srwService.setupWatchpointDirective($scope);
        },
    };
});

SIREPO.app.directive('watchpointReport', function(srwService) {
    return {
        scope: {
            itemId: '=',
        },
        template: [
            '<div data-report-panel="3d" data-model-name="watchpointReport" data-model-data="modelAccess" data-panel-title="{{ reportTitle() }}"></div>',
        ].join(''),
        controller: function($scope) {
            srwService.setupWatchpointDirective($scope);
        },
    };
});
