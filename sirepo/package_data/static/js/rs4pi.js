'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.appLocalRoutes.dose = '/dose/:simulationId';
SIREPO.PLOTTING_COLOR_MAP = 'grayscale';
SIREPO.app.config(function($routeProvider, localRoutesProvider) {
    if (SIREPO.IS_LOGGED_OUT) {
        return;
    }
    var localRoutes = localRoutesProvider.$get();
    $routeProvider
        .when(localRoutes.source, {
            controller: 'Rs4piSourceController as source',
            templateUrl: '/static/html/rs4pi-source.html' + SIREPO.SOURCE_CACHE_KEY,
        })
        .when(localRoutes.dose, {
            controller: 'Rs4piDoseController as dose',
            templateUrl: '/static/html/rs4pi-dose.html' + SIREPO.SOURCE_CACHE_KEY,
        });
});

SIREPO.app.factory('rs4piService', function(appState, frameCache, requestSender, $rootScope) {
    var self = {};
    var PLANE_COORD_NAME = {
        t: 'z',
        s: 'x',
        c: 'y',
    };
    var dicomHistogram = {};
    var planeCoord = {};
    var roiPoints = {};
    var simulationId = null;
    // zoom or advanceFrame
    self.zoomMode = 'advanceFrame';
    self.isEditing = false;
    // select or draw
    self.editMode = 'select';

    self.dicomTitle = function(modelName) {
        if (! appState.isLoaded()) {
            return;
        }
        var series = appState.models.dicomSeries;
        var enumText = '';
        var plane = appState.models[modelName].dicomPlane;
        SIREPO.APP_SCHEMA.enum.DicomPlane.forEach(function(enumInfo) {
            if (enumInfo[0] == plane) {
                enumText = enumInfo[1];
            }
        });
        var planeCoord = self.getPlaneCoord(plane);
        return enumText + ' (' + (frameCache.getCurrentFrame(modelName) + 1)
            + ' / ' + series.planes[plane].frameCount + ') '
            + (planeCoord ? (
                PLANE_COORD_NAME[plane] + ': ' + planeCoord.toFixed(1) + 'mm'
            ) : '');
    };

    self.getActiveROIPoints = function() {
        return roiPoints[appState.models.dicomSeries.activeRoiNumber];
    };


    self.getDicomHistogram = function() {
        return dicomHistogram;
    };

    self.getPlaneCoord = function(plane) {
        return planeCoord[plane];
    };

    self.getROIPoints = function() {
        return roiPoints;
    };

    self.hasROIContours = function() {
        for (var roiNumber in roiPoints) {
            var roi = roiPoints[roiNumber];
            if (roi.contour) {
                for (var frameId in roi.contour) {
                    if (roi.contour[frameId].length) {
                        return true;
                    }
                }
            }
        }
        return false;
    };

    self.isEditMode = function(mode) {
        if (self.isEditing) {
            return self.editMode == mode;
        }
        return false;
    };

    self.isZoomMode = function(mode) {
        return self.zoomMode == mode;
    };

    self.loadROIPoints = function() {
        if (simulationId == appState.models.simulation.simulationId) {
            $rootScope.$broadcast('roiPointsLoaded');
            return;
        }
        requestSender.getApplicationData(
            {
                method: 'roi_points',
                simulationId: appState.models.simulation.simulationId,
            },
            function(data) {
                if (! appState.isLoaded()) {
                    return;
                }
                simulationId = appState.models.simulation.simulationId;
                dicomHistogram = data.models.dicomHistogram;
                roiPoints = data.models.regionsOfInterest;
                $rootScope.$broadcast('roiPointsLoaded');
            });
    };

    self.setEditMode = function(mode) {
        self.editMode = mode;
    };

    self.setPlaneCoord = function(plane, v) {
        if (planeCoord[plane] != v) {
            planeCoord[plane] = v;
            $rootScope.$broadcast('planeCoordChanged');
        }
    };

    self.setZoomMode = function(mode) {
        self.zoomMode = mode;
        $rootScope.$broadcast('refreshDicomPanels');
    };

    self.toggleEditing = function() {
        self.isEditing = ! self.isEditing;
    };

    self.updateROIPoints = function(editedContours) {
        requestSender.getApplicationData(
            {
                method: 'update_roi_points',
                simulationId: appState.models.simulation.simulationId,
                editedContours: editedContours,
            },
            function(data) {});
    };

    return self;
});

SIREPO.app.controller('Rs4piDoseController', function (appState, rs4piService, $scope) {
    var self = this;

    appState.whenModelsLoaded($scope, function() {
        rs4piService.loadROIPoints();
    });
});

SIREPO.app.controller('Rs4piSourceController', function (appState, frameCache, persistentSimulation, rs4piService, $rootScope, $scope) {
    var self = this;
    self.model = 'dicomAnimation';

    self.dicomTitle = function() {
        if (! appState.isLoaded()) {
            return;
        }
        return appState.models.dicomSeries.description;
    };

    self.handleStatus = function(data) {
        if (data.state == 'stopped' && data.percentComplete === 0) {
            self.runSimulation();
            return;
        }
        if (data.startTime) {
            appState.models.dicomAnimation.startTime = data.startTime;
            appState.saveQuietly('dicomAnimation');
        }
        self.simulationErrors = data.errors || '';
        frameCache.setFrameCount(data.frameCount);
    };

    persistentSimulation.initProperties(self, $scope, {
        dicomAnimation: ['dicomPlane', 'startTime'],
        dicomAnimation2: ['dicomPlane', 'startTime'],
        dicomAnimation3: ['dicomPlane', 'startTime'],
    });

    $scope.$on('cancelChanges', function(e, name) {
        if (name == 'dicomEditorState') {
            $rootScope.$broadcast('roiPointsLoaded');
        }
    });

    appState.whenModelsLoaded($scope, function() {
        rs4piService.loadROIPoints();
    });

});

SIREPO.app.directive('appHeader', function(appState, panelState, rs4piService) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appHeader',
        },
        template: [
            '<div class="navbar-header">',
              '<a class="navbar-brand" href="/#about"><img style="width: 40px; margin-top: -10px;" src="/static/img/radtrack.gif" alt="radiasoft"></a>',
              '<div class="navbar-brand"><a href data-ng-click="nav.openSection(\'simulations\')">RS4PI</a></div>',
            '</div>',
            '<div data-app-header-left="nav"></div>',
            '<ul class="nav navbar-nav navbar-right" data-login-menu=""></ul>',
            '<ul class="nav navbar-nav navbar-right" data-ng-show="isLoaded()">',
              '<li data-ng-class="{active: nav.isActive(\'source\')}"><a href data-ng-click="nav.openSection(\'source\')"><span class="glyphicon glyphicon-equalizer"></span> Structure</a></li>',
              '<li data-ng-show="hasROIContours()" data-ng-class="{active: nav.isActive(\'dose\')}"><a href data-ng-click="nav.openSection(\'dose\')"><span class="glyphicon glyphicon-dashboard"></span> Dose</a></li>',
            '</ul>',
            '<ul class="nav navbar-nav navbar-right" data-ng-show="nav.isActive(\'simulations\')">',
              '<li><a href data-ng-click="importDicomModal()"><span class="glyphicon glyphicon-plus sr-small-icon"></span><span class="glyphicon glyphicon-file"></span> Import DICOM</a></li>',
              '<li><a href data-ng-click="showNewFolderModal()"><span class="glyphicon glyphicon-plus sr-small-icon"></span><span class="glyphicon glyphicon-folder-close"></span> New Folder</a></li>',
            '</ul>',
        ].join(''),
        controller: function($scope) {
            $scope.hasROIContours = function() {
                return rs4piService.hasROIContours();
            };
            $scope.isLoaded = function() {
                if ($scope.nav.isActive('simulations')) {
                    return false;
                }
                return appState.isLoaded();
            };
            $scope.showNewFolderModal = function() {
                panelState.showModalEditor('simulationFolder');
            };
            $scope.importDicomModal = function() {
                $('#dicom-import').modal('show');
            };
        },
    };
});

SIREPO.app.directive('appFooter', function() {
    return {
        restrict: 'A',
        scope: {
            nav: '=appFooter',
        },
        template: [
            '<div data-dicom-import-dialog=""></div>',
        ].join(''),
    };
});

SIREPO.app.directive('computeDoseForm', function(appState, persistentSimulation, rs4piService) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div style="margin-top: 1ex; margin-bottom: 0;" class="panel panel-default" novalidate>',
              '<div class="panel-body">',
                '<div><p><b>Compute Dose for PTV</b></p></div>',
                '<select class="form-control" data-ng-model="selectedPTV" data-ng-options="item.roiNumber as item.name for item in roiList"></select>',
                '<button style="margin-top: 1ex" class="btn btn-default pull-right" data-ng-disabled="! selectedPTV" data-ng-click="updatePTV()">Update</button>',

              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.selectedPTV = null;
            $scope.model = 'doseCalculation';

            function loadROIPoints() {
                $scope.roiList = [];
                var rois = rs4piService.getROIPoints();
                Object.keys(rois).forEach(function(roiNumber) {
                    var roi = rois[roiNumber];
                    roi.roiNumber = roiNumber;
                    if (roi.color && roi.contour && ! $.isEmptyObject(roi.contour)) {
                        $scope.roiList.push(roi);
                    }
                });
                $scope.roiList.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }

            $scope.handleStatus = function(data) {
                //TODO(pjm): handle dose computation results here
            };

            $scope.updatePTV = function() {
                appState.models.dicomEditorState.selectedPTV = $scope.selectedPTV;
                appState.saveChanges('dicomEditorState', function() {
                    $scope.runSimulation();
                });
            };

            $scope.$on('roiPointsLoaded', loadROIPoints);
            appState.whenModelsLoaded($scope, function() {
                $scope.selectedPTV = appState.models.dicomEditorState.selectedPTV;
            });
            persistentSimulation.initProperties($scope, $scope, {
                doseCalculation: [],
            });
        },
    };
});


SIREPO.app.directive('dicomImportDialog', function(appState, fileManager, fileUpload, requestSender) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div class="modal fade" data-backdrop="static" id="dicom-import" tabindex="-1" role="dialog">',
              '<div class="modal-dialog modal-lg">',
                '<div class="modal-content">',
                  '<div class="modal-header bg-info">',
                    '<button type="button" class="close" data-dismiss="modal"><span>&times;</span></button>',
                    '<div data-help-button="{{ title }}"></div>',
                    '<span class="lead modal-title text-info">{{ title }}</span>',
                  '</div>',
                  '<div class="modal-body">',
                    '<div class="container-fluid">',
                        '<form class="form-horizontal" name="importForm">',
                          '<div data-ng-show="filename" class="form-group">',
                            '<label class="col-xs-4 control-label">Importing file</label>',
                            '<div class="col-xs-8">',
                              '<p class="form-control-static">{{ filename }}</p>',
                            '</div>',
                          '</div>',
                          '<div data-ng-show="isState(\'ready\')">',
                            '<div data-ng-show="isState(\'ready\')" class="form-group">',
                              '<label>Select DICOM Series (.zip) File</label>',
                              '<input id="dicom-file-import" type="file" data-file-model="dicomFile" accept=".zip" />',
                              '<br />',
                              '<div class="text-warning"><strong>{{ fileUploadError }}</strong></div>',
                            '</div>',
                            '<div class="col-sm-6 pull-right">',
                              '<button data-ng-click="importDicomFile(dicomFile)" class="btn btn-primary" data-ng-class="{\'disabled\': ! dicomFile }">Import File</button>',
                              ' <button data-dismiss="modal" class="btn btn-default">Cancel</button>',
                            '</div>',
                          '</div>',
                          '<div data-ng-show="isState(\'import\')" class="col-sm-12">',
                            '<div class="text-center">',
                              '<span class="glyphicon glyphicon-hourglass"> </span> ',
                              'Importing file - please wait. This may take several minutes.',
                              '<br /><br />',
                            '</div>',
                          '</div>',
                        '</form>',
                      '</div>',
                    '</div>',
                  '</div>',
                '</div>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.title = 'Import DICOM File';
            $scope.state = 'ready';

            function hideAndRedirect(id) {
                $('#dicom-import').modal('hide');
                requestSender.localRedirect('source', {
                    ':simulationId': id,
                });
            }

            $scope.importDicomFile = function(dicomFile) {
                if (! dicomFile) {
                    return;
                }
                $scope.state = 'import';
                fileUpload.uploadFileToUrl(
                    dicomFile,
                    {
                        folder: fileManager.getActiveFolderPath(),
                    },
                    requestSender.formatUrl(
                        'importFile',
                        {
                            '<simulation_type>': SIREPO.APP_SCHEMA.simulationType,
                        }),
                    function(data) {
                        if (data.error || ! data.models) {
                            $scope.resetState();
                            $scope.fileUploadError = data.error || 'A server error occurred.';
                        }
                        else {
                            hideAndRedirect(data.models.simulation.simulationId);
                        }
                    });
            };

            $scope.isState = function(state) {
                return $scope.state == state;
            };

            $scope.resetState = function() {
                $scope.dicomFile = null;
                $scope.fileUploadError = '';
                $scope.state = 'ready';
            };
        },
        link: function(scope, element) {
            $(element).on('show.bs.modal', function() {
                $('#dicom-file-import').val(null);
                scope.$applyAsync(scope.resetState);
            });
            scope.$on('$destroy', function() {
                $(element).off();
            });
        },
    };
});

SIREPO.app.directive('dicomHistogram', function(appState, plotting, rs4piService) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
        },
        template: [
            '<svg class="sr-plot sr-histogram" width="100%" ng-attr-height="{{ height + margin.top + margin.bottom }}">',
              '<g class="plot-g" ng-attr-transform="translate({{ margin.left }},{{ margin.top }})">',
                '<g class="x axis" ng-attr-transform="translate(0, {{ height }})">',
                  '<text class="x-axis-label" ng-attr-x="{{ width / 2 }}" y="40">Hounsfield Units (HU)</text>',
                '</g>',
              '</g>',
            '</svg>',
        ].join(''),
        controller: function($scope) {
            var MIN_HEIGHT = 40;
            $scope.margin = {top: 20, right: 20, bottom: 45, left: 20};
            $scope.width = 0;
            $scope.height = 0;
            var arc, bins, brush, brushg, histogram, plotg, svg, xAxis, xScale, yScale;
            $scope.isClientOnly = true;

            function brushend() {
                if (brush.empty()) {
                    setBounds(null);
                    return;
                }
                var b = brush.extent();
                var left = b[0],
                    right = b[1];
                bins.map(function(d) {
                    left = trimBound(d, left);
                    right = trimBound(d, right);
                });
                setBounds([left, right]);
            }

            function redrawSelectedArea() {
                if (brush.empty()) {
                    svg.selectAll('.bar rect').style('opacity', '1');
                    return;
                }
                var b = brush.extent();
                svg.selectAll('.bar rect').style('opacity', function(d, i) {
                    return d.x + d.dx/2.0 > b[0] && d.x + d.dx/2.0 < b[1] ? "1" : ".4";
                });
            }

            function setBounds(bounds) {
                if (bounds && bounds[0] != bounds[1]) {
                    //TODO(pjm): validate bounds within domain?
                    brushg.call(brush.extent(bounds));
                }
                else {
                    brush.clear();
                    bounds = xScale.domain();
                }
                var dicomWindow = appState.models.dicomWindow;
                dicomWindow.width = bounds[1] - bounds[0];
                dicomWindow.center = bounds[0] + dicomWindow.width / 2;
                $scope.$applyAsync(function() {
                    appState.saveChanges('dicomWindow');
                });
            }

            function trimBound(d, bound) {
                if (d.x + d.dx > bound && d.x < bound) {
                    if (d.x + d.dx/2.0 > bound) {
                        return d.x;
                    }
                    return d.x + d.dx;
                }
                return bound;
            }

            $scope.destroy = function() {
            };

            $scope.init = function() {
                svg = d3.select($scope.element).select('.sr-histogram');
                plotg = svg.select('.plot-g');
                histogram = d3.layout.histogram();
                xScale = d3.scale.linear();
                yScale = d3.scale.linear();
                brush = d3.svg.brush()
                    .on('brush', redrawSelectedArea)
                    .on('brushend', brushend);
                arc = d3.svg.arc()
                    .startAngle(0)
                    .endAngle(function(d, i) { return i ? -Math.PI : Math.PI; });
                xAxis = plotting.createAxis(xScale, 'bottom');
            };

            $scope.load = function() {
                if (! svg) {
                    return;
                }
                var dicomHistogram = rs4piService.getDicomHistogram();
                var idx = 0;
                var extent = dicomHistogram.extent;
                if (! extent) {
                    // dicomHistogram not loaded yet
                    return;
                }
                var dx = (extent[1] - extent[0]) / (extent[2] - 1);
                xScale.domain([extent[0], extent[1]]);
                bins = plotting.linspace(extent[0], extent[1], extent[2]).map(function(d) {
                    return {
                        x: d,
                        dx: dx,
                        y: dicomHistogram.histogram[idx++],
                    };
                });
                yScale.domain([0, d3.max(bins, function(d){return d.y;})]).nice();
                plotg.selectAll('.bar').remove();
                var bar = plotg.selectAll('.bar')
                    .data(bins)
                    .enter().append('g')
                    .attr('class', 'bar');
                bar.append('rect')
                    .attr('x', 1);
                plotg.selectAll('.brush').remove();
                brushg = plotg.append('g')
                    .attr('class', 'brush')
                    .call(brush);
                brushg.selectAll('.resize').append('path');
                $scope.resize();
            };

            $scope.resize = function() {
                if (plotg.select('.bar').empty()) {
                    return;
                }
                $scope.width = parseInt(svg.style('width')) - $scope.margin.left - $scope.margin.right;
                $scope.height = Math.floor($scope.width / 1.5) - $scope.margin.top - $scope.margin.bottom;
                if ($scope.height < MIN_HEIGHT) {
                    $scope.height = MIN_HEIGHT;
                }
                xScale.range([0, $scope.width]);
                yScale.range([$scope.height, 0]);
                plotting.ticks(xAxis, $scope.width, true);
                plotg.selectAll('.bar')
                    .attr('transform', function(d) { return 'translate(' + xScale(d.x) + ',' + yScale(d.y) + ')'; });
                plotg.selectAll('.bar rect')
                    .attr('width', (xScale(bins[0].dx) - xScale(0)) - 1)
                    .attr('height', function(d) { return $scope.height - yScale(d.y); });
                plotg.select('.x.axis')
                    .call(xAxis);
                arc.outerRadius($scope.height / 15);
                brush.x(xScale);
                brushg.call(brush);
                brushg.selectAll('.resize path')
                    .attr('transform', 'translate(0,' +  $scope.height / 2 + ')')
                    .attr('d', arc);
                brushg.selectAll('.resize path')
                    .attr('transform', 'translate(0,' +  $scope.height / 2 + ')');
                brushg.selectAll('rect')
                    .attr('height', $scope.height);
                var dicomWindow = appState.models.dicomWindow;
                var b = [dicomWindow.center - dicomWindow.width / 2, dicomWindow.center + dicomWindow.width / 2];
                if (b[0] == xScale.domain()[0] && b[1] == xScale.domain()[1]) {
                    brush.clear();
                }
                else {
                    brushg.call(brush.extent(b));
                }
                redrawSelectedArea();
            };

            $scope.$on('roiPointsLoaded', function() {
                $scope.load();
            });

            $scope.$on('dicomWindow.changed', function() {
                $scope.resize();
            });

        },
        link: function link(scope, element) {
            plotting.linkPlot(scope, element);
        },
    };
});

SIREPO.app.directive('dicomPlot', function(appState, frameCache, panelState, plotting, rs4piService, $interval, $rootScope) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
            isSubFrame: '@',
        },
        templateUrl: '/static/html/dicom.html' + SIREPO.SOURCE_CACHE_KEY,
        controller: function($scope) {
            $scope.canvasHeight = 0;
            $scope.canvasSize = 0;
            $scope.margin = {top: 20, left: 10, right: 10, bottom: 0};
            $scope.requestCache = {};
            $scope.rs4piService = rs4piService;

            var cacheCanvas, imageData;
            var canvas, ctx, dicomDomain, frameId, xAxisScale, xValues, yAxisScale, yValues, zoom;
            var colorScale;
            var drag, dragLine;
            var editedContours = {};
            var frameScale;
            var hasDragged = false;
            var heatmap;
            var inRequest = false;
            var oldDicomWindow = null;
            var planeLines = null;
            var roiContours = null;
            var roiLine;
            var selectedDicomPlane = '';

            function addContours() {
                clearContours();
                var rois = rs4piService.getROIPoints();
                var yMax = yValues[yValues.length - 1] + yValues[0];
                if (! roiContours && Object.keys(rois).length === 0) {
                    return;
                }
                Object.keys(rois).forEach(function(roiNumber) {
                    rois[roiNumber].isVisible = false;
                });
                roiContours = {};
                Object.keys(rois).forEach(function(roiNumber) {
                    var roi = rois[roiNumber];
                    var contourDataList = getContourForFrame(roi);
                    if (contourDataList) {
                        var points = [];
                        contourDataList.forEach(function(contourData) {
                            if (points.length) {
                                // roiLine.defined() controls breaks between path segments
                                points.push(null);
                            }
                            for (var i = 0; i < contourData.length; i += 2) {
                                points.push([
                                    contourData[i],
                                    //TODO(pjm): flipud
                                    yMax - contourData[i + 1],
                                ]);
                            }
                        });
                        roi.isVisible = points.length ? true : false;
                        var parent = select('.draw-area');
                        roiContours[roiNumber] = {
                            roi: roi,
                            roiNumber: roiNumber,
                            points: points,
                            roiPath: parent.append('path')
                                .attr('class', 'dicom-roi')
                                .datum(points),
                            dragPath: parent.append('path')
                                .attr('class', 'dicom-dragpath')
                                .datum(points)
                                .on('click', roiClick),
                        };
                        roiContours[roiNumber].dragPath.append('title').text(roi.name);
                    }
                });
                redrawContours();
            }

            function advanceFrame() {
                if (! d3.event || d3.event.sourceEvent.type == 'mousemove') {
                    return;
                }
                var scale = d3.event.scale;
                $scope.isPlaying = false;
                // don't advance for small scale adjustments, ex. from laptop touchpad
                if (Math.abs(scale - 1) < 0.03) {
                    return;
                }
                $scope.$applyAsync(function() {
                    if (scale > 1 && ! $scope.isLastFrame()) {
                        $scope.advanceFrame(1);
                    }
                    else if (scale < 1 && ! $scope.isFirstFrame()) {
                        $scope.advanceFrame(-1);
                    }
                    else {
                        resetZoom();
                    }
                });
            }

            function clearCache() {
                $scope.requestCache = {};
                colorScale = null;
            }

            function clearContours() {
                roiContours = null;
                select().selectAll('.draw-area path').remove();
            }

            function createPlaneLines(axis) {
                return {
                    planeLine: select('.draw-area')
                        .append('line')
                        .attr('class', 'cross-hair')
                        .attr(oppositeAxis(axis) + '1', 0),
                    dragLine: select('.draw-area')
                        .append('line')
                        .attr('class', 'plane-dragline plane-dragline-' + axis)
                        .attr(oppositeAxis(axis) + '1', 0)
                        .call(dragLine),
                };
            }

            function dicomWindowChanged() {
                return !(oldDicomWindow && appState.deepEquals(oldDicomWindow, appState.models.dicomWindow));
            }

            function getContourForFrame(roi) {
                var editRoi = editedContours[roi.roiNumber];
                if (editRoi && editRoi[frameId]) {
                    return editRoi[frameId];
                }
                if (roi.contour && roi.contour[frameId]) {
                    return roi.contour[frameId];
                }
                return null;
            }

            function getRange(values) {
                return [values[0], values[values.length - 1]];
            }

            function getSize(values) {
                return values[values.length - 1] - values[0];
            }

            function getTargetPlane(axis) {
                if (axis == 'y') {
                    return $scope.isTransversePlane() ? 'c' : 't';
                }
                return selectedDicomPlane == 's' ? 'c' : 's';
            }

            function initColormap() {
                if (! colorScale) {
                    var dicomWindow = appState.models.dicomWindow;
                    var zMin = dicomWindow.center - dicomWindow.width / 2;
                    var zMax = dicomWindow.center + dicomWindow.width / 2;
                    var colorRange = [0, 255];
                    colorScale = d3.scale.linear()
                        .domain(plotting.linspace(zMin, zMax, colorRange.length))
                        .rangeRound(colorRange)
                        .clamp(true);
                }
            }

            function initImage() {
                var xSize = heatmap[0].length;
                var ySize = heatmap.length;
                var img = imageData;

                for (var yi = 0, p = -1; yi < ySize; ++yi) {
                    for (var xi = 0; xi < xSize; ++xi) {
                        var c = colorScale(heatmap[yi][xi]);
                        img.data[++p] = c;
                        img.data[++p] = c;
                        img.data[++p] = c;
                        img.data[++p] = 0xff;
                    }
                }
                cacheCanvas.getContext('2d').putImageData(img, 0, 0);
            }

            function isDrawMode() {
                return rs4piService.isEditMode('draw') && $scope.isTransversePlane() && ! $scope.isSubFrame;
            }

            function lineDrag() {
                /*jshint validthis: true*/
                var line = d3.select(this);
                if (line.classed('plane-dragline-y')) {
                    var y = parseFloat(line.attr('y1')) + parseFloat(d3.event.dy);
                    line.attr('y1', y).attr('y2', y);
                    planeLines.y.planeLine.attr('y1', y).attr('y2', y);
                }
                else if (line.classed('plane-dragline-x')) {
                    var x = parseFloat(line.attr('x1')) + parseFloat(d3.event.dx);
                    line.attr('x1', x).attr('x2', x);
                    planeLines.x.planeLine.attr('x1', x).attr('x2', x);
                }
            }

            function lineDragEnd() {
                /*jshint validthis: true*/
                var line = d3.select(this);
                if (line.classed('plane-dragline-y')) {
                    var y = yAxisScale.invert(line.attr('y1'));
                    if ($scope.isTransversePlane()) {
                        //TODO(pjm): flipud
                        y = yValues[yValues.length - 1] + yValues[0] - y;
                    }
                    updateTargetPlane('y', y);
                }
                else if (line.classed('plane-dragline-x')) {
                    updateTargetPlane('x', xAxisScale.invert(line.attr('x1')));
                }
            }

            function loadImage() {
                oldDicomWindow = appState.clone(appState.models.dicomWindow);
                initColormap();
                initImage();
            }

            function oppositeAxis(axis) {
                if (axis == 'y') {
                    return 'x';
                }
                if (axis == 'x') {
                    return 'y';
                }
                throw 'invalid axis: ' + axis;
            }

            function redrawContours() {
                if (! roiContours) {
                    addContours();
                    return;
                }
                var canDrag = rs4piService.isEditMode('select');
                Object.keys(roiContours).forEach(function(roiNumber) {
                    var v = roiContours[roiNumber];
                    v.roiPath.attr('d', roiLine)
                        .classed('dicom-roi-selected', roiNumber == appState.models.dicomSeries.activeRoiNumber)
                        .attr('style', roiStyle(v.roi, roiNumber));
                    v.dragPath.attr('d', roiLine)
                        .classed('dicom-dragpath-move', canDrag)
                        .classed('dicom-dragpath-select', ! canDrag)
                        .classed('selectable-path', ! isDrawMode());
                    if (canDrag) {
                        v.dragPath.call(drag);
                    }
                    else {
                        v.dragPath.on('.drag', null);
                    }
                });
            }

            function redrawActivePath() {
                var active = roiContours[appState.models.dicomSeries.activeRoiNumber];
                if (active) {
                    active.roiPath.attr('d', roiLine);
                    active.dragPath.attr('d', roiLine);
                }
            }
            var drawPoints = null;
            var drawPath = null;

            function mousedown() {
                d3.event.preventDefault();
                drawPoints = [mousePoint()];
                var roi = rs4piService.getActiveROIPoints();
                drawPath = select('.draw-area').append('path')
                    .attr('class', 'dicom-roi dicom-roi-selected')
                    .datum(drawPoints)
                    .attr('d', roiLine)
                    .attr('style', roiStyle(roi));
                select('.draw-area').append('circle')
                   .attr('cx', xAxisScale(drawPoints[0][0]))
                   .attr('cy', yAxisScale(drawPoints[0][1]))
                   .attr('r', 10)
                   .attr('class', 'dicom-draw-start')
                    .attr('style', roiStyle(roi));
                select('.overlay').on('mousemove', mousemove)
                    .on('mouseup', mouseup);
            }

            function mousemove() {
                if ('buttons' in d3.event && ! d3.event.buttons) {
                    // buttonup already happened off the svg
                    mouseup();
                    return;
                }
                drawPoints.push(mousePoint());
                drawPath.attr('d', roiLine);
            }

            function mousePoint() {
                var p = d3.mouse(select('.overlay').node());
                return [xAxisScale.invert(p[0]), yAxisScale.invert(p[1])];
            }

            function mouseup() {
                drawPath.remove();
                select('.dicom-draw-start').remove();
                select('.overlay').on('mousemove', null)
                    .on('mouseup', null);
                if (drawPoints.length > 1) {
                    var roi = rs4piService.getActiveROIPoints();
                    if (roiContours[roi.roiNumber]) {
                        var points = roiContours[roi.roiNumber].points;
                        if (points.length) {
                            points.push(null);
                            drawPoints = $.merge(points, drawPoints);
                        }
                    }
                    updateContourData(drawPoints);
                    addContours();
                    setEditorDirty();
                    $scope.$applyAsync();
                }
            }

            function redrawIfChanged(newValue, oldValue) {
                if ($scope.isTransversePlane() && newValue != oldValue) {
                    redrawContours();
                    updatePlaneLines();
                    resetZoom();
                    updateCursor();

                    select('.overlay').on('mousemove', null)
                        .on('mouseup', null)
                        .on('mousedown', isDrawMode() ? mousedown : null);
                }
            }

            function updateCursor() {
                select('.overlay').classed('dicom-roimode-draw', isDrawMode());
                select('.overlay').classed('mouse-zoom', rs4piService.isZoomMode('zoom') && ! isDrawMode());
            }

            function refresh() {
                if (! xValues) {
                    return;
                }
                if (rs4piService.isZoomMode('zoom')) {
                    plotting.trimDomain(xAxisScale, getRange(xValues));
                    plotting.trimDomain(yAxisScale, getRange(yValues));
                }
                updateCursor();
                plotting.drawImage(xAxisScale, yAxisScale, $scope.canvasSize, $scope.canvasHeight, xValues, yValues, canvas, cacheCanvas, false);
                if ($scope.isTransversePlane()) {
                    redrawContours();
                }
                updatePlaneLines();
                resetZoom();
            }

            function resetZoom() {
                zoom = d3.behavior.zoom();
                select('.plot-viewport').call(zoom);
                if (rs4piService.isZoomMode('zoom')) {
                    zoom.x(xAxisScale)
                        .y(yAxisScale)
                        .on('zoom', refresh);
                }
                else if (rs4piService.isZoomMode('advanceFrame')) {
                    zoom.x(frameScale)
                        .on('zoom', advanceFrame);
                }
                if (isDrawMode()) {
                    select('.plot-viewport').on('mousedown.zoom', null);
                }
            }

            function roiClick() {
                /*jshint validthis: true*/
                if (d3.event.defaultPrevented) {
                    return;
                }
                d3.event.preventDefault();
                setActiveROIFromNode(this);
            }

            function roiDrag(d) {
                /*jshint validthis: true*/
                if (! rs4piService.isEditing || ! rs4piService.isEditMode('select')) {
                    srlog('roiDrag not select mode');
                    return;
                }
                var dx = d3.event.dx;
                var dy = d3.event.dy;
                if (dx || dy) {
                    hasDragged = true;
                    var xDomain = xAxisScale.domain();
                    var xPixelSize = dx * (xDomain[1] - xDomain[0]) / $scope.canvasSize;
                    var yDomain = yAxisScale.domain();
                    var yPixelSize = dy * (yDomain[1] - yDomain[0]) / $scope.canvasHeight;
                    d.forEach(function(p) {
                        if (p) {
                            p[0] += xPixelSize;
                            p[1] -= yPixelSize;
                        }
                    });
                    setActiveROIFromNode(this);
                    redrawActivePath();
                }
            }

            function roiDragEnd(d) {
                if (hasDragged) {
                    hasDragged = false;
                    updateContourData(d);
                    setEditorDirty();
                    $scope.$applyAsync();
                }
            }

            function roiStyle(roi, roiNumber) {
                var color = roi.color;
                var res = 'stroke: rgb(' + color.join(',') + ')';
                if (! rs4piService.isEditing && appState.models.dicomSeries.activeRoiNumber == roiNumber) {
                    res += '; fill: rgb(' + color.join(',') + '); fill-opacity: 0.5';
                }
                return res;
            }

            function select(selector) {
                var e = d3.select($scope.element);
                return selector ? e.select(selector) : e;
            }

            function setActiveROI(roiNumber) {
                if (roiNumber == appState.models.dicomSeries.activeRoiNumber) {
                    return;
                }
                $scope.$applyAsync(function() {
                    appState.models.dicomSeries.activeRoiNumber = roiNumber;
                    redrawContours();
                });
            }

            function setActiveROIFromNode(node) {
                var roiNumbers = Object.keys(roiContours);
                for (var i = 0; i < roiNumbers.length; i++) {
                    if (roiContours[roiNumbers[i]].dragPath.node() === node) {
                        setActiveROI(roiNumbers[i]);
                        return;
                    }
                }
                throw 'invalid dragPath';
            }

            function setEditorDirty() {
                var editorState = appState.models.dicomEditorState;
                editorState.editCounter = (editorState.editCounter || 0) + 1;
            }

            function updateContourData(points) {
                var roi = rs4piService.getActiveROIPoints();
                if (! editedContours[roi.roiNumber]) {
                    editedContours[roi.roiNumber] = {};
                }
                var yMax = yValues[yValues.length - 1] + yValues[0];
                var contourList = [];
                editedContours[roi.roiNumber][frameId] = contourList;
                var current = [];
                contourList.push(current);
                points.forEach(function(p) {
                    if (p) {
                        current.push(
                            p[0],
                            //TODO(pjm): flipud
                            yMax - p[1]);
                    }
                    else {
                        current = [];
                        contourList.push(current);
                    }
                });
            }

            function updateCurrentFrame() {
                appState.models.dicomSeries.planes[selectedDicomPlane].frameIndex = frameCache.getCurrentFrame($scope.modelName);
                appState.saveQuietly('dicomSeries');
            }

            function updatePlaneLine(axis, axisScale, size) {
                var v = rs4piService.getPlaneCoord(getTargetPlane(axis));
                if (axis == 'y' && $scope.isTransversePlane()) {
                    //TODO(pjm): flipud
                    v = yValues[yValues.length - 1] + yValues[0] - v;
                }
                v = axisScale(v);
                if (! isNaN(v)) {
                    ['planeLine', 'dragLine'].forEach(function (f) {
                        planeLines[axis][f]
                            .attr(axis + '1', v)
                            .attr(axis + '2', v)
                            .attr(oppositeAxis(axis) + '2', size)
                            .classed('selectable-path', ! isDrawMode());
                    });
                }
            }

            function updatePlaneLines() {
                if (! dicomDomain) {
                    return;
                }
                if (! planeLines) {
                    planeLines = {
                        x: createPlaneLines('x'),
                        y: createPlaneLines('y'),
                    };
                }
                updatePlaneLine('x', xAxisScale, $scope.canvasHeight);
                updatePlaneLine('y', yAxisScale, $scope.canvasSize);
            }

            function updateSelectedDicomPlane(plane) {
                selectedDicomPlane = plane;
                var planeInfo = appState.models.dicomSeries.planes[selectedDicomPlane];
                frameCache.setCurrentFrame($scope.modelName, planeInfo.frameIndex);
                frameCache.setFrameCount(planeInfo.frameCount, $scope.modelName);
            }

            function updateTargetPlane(axis, v) {
                var values = axis == 'y' ? yValues : xValues;
                var min = values[0];
                var max = values[values.length - 1];
                if (v < min) {
                    v = min;
                }
                else if (v > max) {
                    v = max;
                }
                var series = appState.models.dicomSeries;
                var targetPlane = getTargetPlane(axis);
                var frameCount = series.planes[targetPlane].frameCount;
                var newIndex = Math.floor((v - min) * frameCount / (max - min));
                if (newIndex == frameCount) {
                    newIndex--;
                }
                $scope.$applyAsync(function() {
                    $rootScope.$broadcast('updatePlaneFrameIndex', targetPlane, newIndex);
                });
            }

            $scope.deleteSelected = function() {
                var roi = rs4piService.getActiveROIPoints();
                if (! editedContours[roi.roiNumber]) {
                    editedContours[roi.roiNumber] = {};
                }
                editedContours[roi.roiNumber][frameId] = [];
                setEditorDirty();
                clearContours();
                redrawContours();
            };

            $scope.destroy = function() {
                zoom.on('zoom', null);
            };

            $scope.dicomTitle = function() {
                return rs4piService.dicomTitle($scope.modelName);
            };

            $scope.getDefaultFrame = function() {
                var model = appState.models[$scope.modelName];
                return appState.models.dicomSeries.planes[model.dicomPlane].frameIndex || 0;
            };

            $scope.init = function() {
                select('svg').attr('height', plotting.initialHeight($scope));
                xAxisScale = d3.scale.linear();
                yAxisScale = d3.scale.linear();
                frameScale = d3.scale.linear();
                drag = d3.behavior.drag()
                    .origin(function(d) { return {x: d[0], y: d[1]}; })
                    .on('drag', roiDrag)
                    .on('dragstart', function() {
                        // don't let event propagate to zoom behavior
                        d3.event.sourceEvent.stopPropagation();
                    })
                    .on('dragend', roiDragEnd);
                dragLine = d3.behavior.drag()
                    .on('drag', lineDrag)
                    .on('dragstart', function() {
                        // don't let event propagate to zoom behavior
                        d3.event.sourceEvent.stopPropagation();
                    })
                    .on('dragend', lineDragEnd);
                resetZoom();
                canvas = select('canvas').node();
                ctx = canvas.getContext('2d');
                cacheCanvas = document.createElement('canvas');
                $scope.$on('planeCoordChanged', updatePlaneLines);
                roiLine = d3.svg.line()
                    .defined(function(d) { return d !== null; })
                    .interpolate('linear-closed')
                    .x(function(d) {
                        return xAxisScale(d[0]);
                    })
                    .y(function(d) {
                        return yAxisScale(d[1]);
                    });
            };

            $scope.isROISelected = function() {
                if (! appState.isLoaded()) {
                    return false;
                }
                var num = appState.models.dicomSeries.activeRoiNumber;
                if (num) {
                    var rois = rs4piService.getROIPoints();
                    if (rois && num in rois) {
                        return rois[num].isVisible;
                    }
                }
                return false;
            };

            $scope.isTransversePlane = function() {
                return selectedDicomPlane == 't';
            };

            $scope.load = function(json) {
                if (! selectedDicomPlane) {
                    updateSelectedDicomPlane(appState.models[$scope.modelName].dicomPlane);
                }
                updateCurrentFrame();
                var newFrameId = json.frameId || json.ImagePositionPatient[2];
                if (frameId != newFrameId) {
                    frameId = newFrameId;
                    roiContours = null;
                }
                var preserveZoom = xValues ? true : false;
                dicomDomain = appState.clone(json.domain);
                xValues = plotting.linspace(dicomDomain[0][0], dicomDomain[1][0], json.shape[1]);
                yValues = plotting.linspace(dicomDomain[0][1], dicomDomain[1][1], json.shape[0]);
                cacheCanvas.width = xValues.length;
                cacheCanvas.height = yValues.length;
                imageData = ctx.getImageData(0, 0, cacheCanvas.width, cacheCanvas.height);
                if (! preserveZoom) {
                    xAxisScale.domain(getRange(xValues));
                    yAxisScale.domain(getRange(yValues));
                }
                heatmap = json.pixel_array;
                loadImage();
                $scope.resize();
                rs4piService.setPlaneCoord(selectedDicomPlane, dicomDomain[0][2]);
            };

            $scope.modelChanged = function() {
                var currentPlane = appState.models[$scope.modelName].dicomPlane;
                if (dicomWindowChanged()) {
                    colorScale = null;
                }
                if (selectedDicomPlane != currentPlane) {
                    clearCache();
                    clearContours();
                    var oldPlane = selectedDicomPlane;
                    updateSelectedDicomPlane(currentPlane);
                    xValues = null;
                    $scope.requestData();
                    if (! $scope.isSubFrame) {
                        ['dicomAnimation2', 'dicomAnimation3'].forEach(function(m) {
                            if (appState.models[m].dicomPlane == currentPlane) {
                                appState.models[m].dicomPlane = oldPlane;
                                appState.saveChanges(m);
                            }
                        });
                    }
                }
                else {
                    loadImage();
                    $scope.resize();
                }
            };

            $scope.resize = function() {
                if (select().empty()) {
                    return;
                }
                var canvasSize = parseInt(select().style('width')) - $scope.margin.left - $scope.margin.right;
                if (isNaN(canvasSize) || ! xValues) {
                    return;
                }
                $scope.canvasSize = canvasSize;
                $scope.canvasHeight = canvasSize * getSize(yValues) / getSize(xValues);
                xAxisScale.range([0, canvasSize]);
                yAxisScale.range([$scope.canvasHeight, 0]);
                refresh();
            };


            $scope.requestData = function() {
                if (! $scope.hasFrames()) {
                    return;
                }
                var index = frameCache.getCurrentFrame($scope.modelName);
                if (frameCache.getCurrentFrame($scope.modelName) == $scope.prevFrameIndex) {
                    return;
                }
                var cache = $scope.requestCache[index];
                if (cache) {
                    if ($scope.isPlaying) {
                        $interval(
                            function() {
                                $scope.load(cache);
                                $scope.advanceFrame(1);
                            },
                            0,
                            1
                        );
                    }
                    else {
                        $scope.load(cache);
                    }
                    $scope.prevFrameIndex = index;
                }
                else {
                    if (inRequest) {
                        return;
                    }
                    inRequest = true;
                    frameCache.getFrame($scope.modelName, index, $scope.isPlaying, function(index, data) {
                        inRequest = false;
                        $scope.prevFrameIndex = index;
                        if ($scope.element) {
                            if (data.error) {
                                panelState.setError($scope.modelName, data.error);
                                return;
                            }
                            $scope.requestCache[index] = data;
                            if (index == frameCache.getCurrentFrame($scope.modelName)) {
                                $scope.load(data);
                            }
                        }
                        if ($scope.isPlaying) {
                            $scope.advanceFrame(1);
                        }
                        else {
                            var current = frameCache.getCurrentFrame($scope.modelName);
                            if (current != index) {
                                $scope.requestData();
                            }
                        }
                    });
                }
            };

            $scope.$on('cancelChanges', function(e, name) {
                if (name == 'dicomEditorState' && ! $scope.isSubFrame) {
                    editedContours = {};
                    clearContours();
                    redrawContours();
                }
            });

            $scope.$on('dicomEditorState.changed', function() {
                if ($scope.isSubFrame) {
                    return;
                }
                var rois = rs4piService.getROIPoints();
                Object.keys(editedContours).forEach(function(roiNumber) {
                    Object.keys(editedContours[roiNumber]).forEach(function(frameId) {
                        rois[roiNumber].contour[frameId] = editedContours[roiNumber][frameId];
                    });
                });
                rs4piService.updateROIPoints(editedContours);
                editedContours = {};
            });

            $scope.$on('refreshDicomPanels', refresh);

            $scope.$on('roiPointsLoaded', function() {
                if (xValues) {
                    clearContours();
                    refresh();
                }
            });

            $scope.$on('updatePlaneFrameIndex', function(evt, plane, frameIndex) {
                if (plane == selectedDicomPlane) {
                    frameCache.setCurrentFrame($scope.modelName, frameIndex);
                    $scope.requestData();
                }
            });

            $scope.$watch('rs4piService.isEditing', redrawIfChanged);
            $scope.$watch('rs4piService.editMode', redrawIfChanged);
        },
        link: function link(scope, element) {
            appState.whenModelsLoaded(scope, function() {
                plotting.linkPlot(scope, element);
            });
        },
    };
});

SIREPO.app.directive('roiConfirmForm', function(appState) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<form name="form" data-ng-if="isDirty()" class="panel panel-default" novalidate>',
              '<div class="panel-body">',
                '<div><p>Update the ROI contours?</p></div>',
                '<div class="pull-right" data-buttons="" data-model-name="modelName" data-fields="fields"></div>',
              '</div>',
            '</form>',
        ].join(''),
        controller: function($scope) {
            $scope.modelName = 'dicomEditorState';
            $scope.fields = ['editCounter'];

            $scope.isDirty = function() {
                var info = {};
                info[$scope.modelName] = $scope.fields;
                return appState.areFieldsDirty(info);
            };
        },
    };
});

SIREPO.app.directive('roiTable', function(appState, panelState, rs4piService) {
    return {
        restrict: 'A',
        scope: {
            source: '=controller',
        },
        template: [
            '<button data-ng-click="newRegion()" class="btn btn-info btn-xs pull-right"><span class="glyphicon glyphicon-plus"></span> New Region</button>',
            '<table style="width: 100%;  table-layout: fixed" class="table table-hover">',
              '<colgroup>',
                '<col>',
                '<col style="width: 8ex">',
              '</colgroup>',
              '<thead>',
                '<tr>',
                  '<th>Name</th>',
                  '<th style="white-space: nowrap">Color</th>',
                '</tr>',
              '</thead>',
              '<tbody>',
                '<tr data-ng-show="showROI(roi)" data-ng-click="activate(roi)" data-ng-repeat="roi in roiList track by roi.name" data-ng-class="{warning: isActive(roi)}">',
                  '<td style="padding-left: 1em">{{ roi.name }}</td>',
                  '<td><div style="border: 1px solid #333; background-color: {{ d3Color(roi.color) }}">&nbsp;</div></td>',
                '</tr>',
              '</tbody>',
            '</table>',
        ].join(''),
        controller: function($scope) {
            $scope.rs4piService = rs4piService;
            $scope.roiList = null;

            function loadROIPoints() {
                $scope.roiList = [];
                var rois = rs4piService.getROIPoints();
                Object.keys(rois).forEach(function(roiNumber) {
                    var roi = rois[roiNumber];
                    roi.roiNumber = roiNumber;
                    if (roi.color) {
                        $scope.roiList.push(roi);
                    }
                });
                $scope.roiList.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }

            $scope.activate = function(roi) {
                appState.models.dicomSeries.activeRoiNumber = roi.roiNumber;
                appState.saveChanges('dicomSeries');
            };

            $scope.d3Color = function(c) {
                return window.d3 ? d3.rgb(c[0], c[1], c[2]) : '#000';
            };

            $scope.isActive = function(roi) {
                if (appState.isLoaded()) {
                    return appState.models.dicomSeries.activeRoiNumber == roi.roiNumber;
                }
                return false;
            };

            $scope.newRegion = function() {
                appState.models.dicomROI = appState.setModelDefaults({}, 'dicomROI');
                panelState.showModalEditor('dicomROI');
            };

            $scope.showROI = function(roi) {
                return roi.isVisible || $scope.isActive(roi) || rs4piService.isEditMode('draw');
            };

            $scope.$on('cancelChanges', function(e, name) {
                if (name == 'dicomROI') {
                    appState.removeModel(name);
                }
            });

            $scope.$on('modelChanged', function(e, name) {
                if (name == 'dicomROI') {
                    var m = appState.models.dicomROI;
                    var c = d3.rgb(m.color);
                    if (c && (c.r > 0 || c.g > 0 || c.b > 0)) {
                        var rois = rs4piService.getROIPoints();
                        var id = appState.maxId(
                            $.map(rois, function(v) { return v; }),
                            'roiNumber') + 1;
                        var editedContours = {};
                        editedContours[id] = {
                            contour: {},
                            name: m.name,
                            color: [c.r, c.g, c.b],
                        };
                        rois[id] = editedContours[id];
                        rs4piService.updateROIPoints(editedContours);
                        loadROIPoints();
                        appState.models.dicomSeries.activeRoiNumber = id;
                        rs4piService.isEditing = true;
                        rs4piService.setEditMode('draw');
                    }
                    appState.removeModel(name);
                }
            });

            $scope.$on('roiPointsLoaded', loadROIPoints);
        },
    };
});
