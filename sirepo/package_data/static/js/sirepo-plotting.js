'use strict';

(function() {

    function linkPlot(scope, d3Service, appState) {
        d3Service.d3().then(function(d3) {

            function requestData() {
                if (! appState.isLoaded())
                    return;
                //console.log('requesting data: ', scope.modelName);
                appState.requestData(scope.modelName, function(data) {
                    //console.log('loading data: ', scope.modelName);
                    if (scope.svg)
                        scope.load(data);
                });
            }
            scope.$on(scope.modelName + '.changed', requestData);
            scope.init(scope.id);
            requestData();
        });
    }

    app.directive('plot2d', function(appState, d3Service) {
        return {
            restrict: 'A',
            scope: {
                modelName: '@',
                id: '@',
            },
            template: [
                '<svg>',
                  '<g ng-attr-transform="translate({{ margin.left }},{{ margin.top }})">',
                    '<g class="x axis"></g>',
                    '<g class="x axis grid"></g>',
                    '<g class="y axis"></g>',
                    '<g class="y axis grid"></g>',
                    '<text class="y-axis-label" transform="rotate(-90)" ng-attr-y="-{{ margin.left }}" dy="1em"></text>',
                    '<text class="x-axis-label" dy="1em"></text>',
                    '<text class="main-title" ng-attr-y="-{{ margin.top / 2 }}"></text>',
                    '<g class="focus" style="display: none;">',
                      '<circle r="6" />',
                      '<text class="focus-text" x="9" dy=".35em"></text>',
                    '</g>',
                    '<rect class="overlay" />',
                    '<svg class="plot-viewport">',
                      '<path class="line" />',
                    '</svg>',
                  '</g>',
                '</svg>',
                '<div style="margin-left: 30px" class="text-center">',
                  '<strong>{{ xRange[0] | number }}</strong>',
                  '<input type="text" class="srw-plot2d-slider" value="" data-slider-min="0" data-slider-max="100" data-slider-step="1" data-slider-value="[0,100]" data-slider-tooltip="hide">',
                  '<strong>{{ xRange[1] | number }}</strong>',
                '</div>',
            ].join(''),
            controller: function($scope) {

                $scope.margin = {top: 50, right: 50, bottom: 80, left: 70};
                var formatter, graphLine, plotId, points, xAxis, xAxisGrid, xAxisScale, xPeakValues, xUnits, yAxis, yAxisGrid, yAxisScale;

                function computePeaks(json, dimensions, xPoints) {
                    var peakSpacing = dimensions[0] / 20;
                    var minPixelHeight = dimensions[1] * .995;
                    var xPeakValues = [];
                    var sortedPoints = d3.zip(xPoints, json.points).sort(function(a, b) { return b[1] - a[1] });
                    for (var i = 0; i < sortedPoints.length / 2; i++) {
                        var p = sortedPoints[i]
                        var xPixel = xAxisScale(p[0]);
                        var yPixel = yAxisScale(p[1]);
                        if (yPixel >= minPixelHeight) {
                            break;
                        }
                        var found = false;
                        for (var j = 0; j < xPeakValues.length; j++) {
                            if (Math.abs(xPixel - xPeakValues[j][2]) < peakSpacing) {
                                found = true;
                                break;
                            }
                        }
                        if (! found)
                            xPeakValues.push([p[0], p[1], xPixel]);
                    }
                    //console.log('local maxes: ', xPeakValues.length);
                    return xPeakValues;
                }

                function linspace(start, stop, nsteps) {
                    var delta = (stop - start) / (nsteps - 1);
                    return d3.range(start, stop + delta, delta).slice(0, nsteps);
                }

                function mouseMove() {
                    if (! points)
                        return;
                    var x0 = xAxisScale.invert(d3.mouse(this)[0]);
                    var localMax = null;
                    for (var i = 0; i < xPeakValues.length; i++) {
                        var v = xPeakValues[i];
                        if (localMax === null || Math.abs(v[0] - x0) < Math.abs(localMax[0] - x0)) {
                            localMax = v;
                        }
                    }
                    if (localMax) {
                        var xPixel = xAxisScale(localMax[0]);
                        if (xPixel < 0 || xPixel >= select('.plot-viewport').attr('width'))
                            return;
                        var focus = select('.focus');
                        focus.attr('transform', 'translate(' + xPixel + ',' + yAxisScale(localMax[1]) + ')');
                        focus.select('text').text(formatter(localMax[0]) + ' ' + xUnits);
                    }
                };

                function select(selector) {
                    return d3.select(plotId + (selector ? (' ' + selector) : ''));
                }

                function sliderChanged(ev) {
                    if (! points)
                        return;
                    function computePoint(value) {
                        return Math.round($scope.xRange[0] + (value / 100) * ($scope.xRange[1] - $scope.xRange[0]));
                    }
                    var xStart = computePoint(ev.value[0]);
                    var xEnd = computePoint(ev.value[1]);
                    xAxisScale.domain([xStart, xEnd]);

                    var yMin, yMax;
                    for (var i = 0; i < points.length; i++) {
                        var p = points[i];
                        if (p[0] < xStart)
                            continue;
                        if (p[0] > xEnd)
                            break;
                        if (yMin === undefined || yMin > p[1])
                            yMin = p[1];
                        if (yMax === undefined || yMax < p[1])
                            yMax = p[1];
                    }
                    yAxisScale.domain([yMin, yMax]);
                    $scope.resize();
                }

                $scope.init = function(id) {
                    plotId = '#' + id;
                    formatter = d3.format(',.0f');
                    $scope.slider = $(plotId + ' .srw-plot2d-slider').slider();
                    $scope.slider.on('slide', sliderChanged);
                    $(window).resize($scope.resize);
                    xAxisScale = d3.scale.linear();
                    yAxisScale = d3.scale.linear();
                    xAxis = d3.svg.axis()
                        .scale(xAxisScale)
                        .orient('bottom');
                    xAxisGrid = d3.svg.axis()
                        .scale(xAxisScale)
                        .orient('bottom');
                    yAxis = d3.svg.axis()
                        .scale(yAxisScale)
                    // this causes a "number of fractional digits" error in MSIE
                    //.tickFormat(d3.format('e'))
                        .tickFormat(function (value) {
                            return value.toExponential();
                        })
                        .ticks(5)
                        .orient('left');
                    yAxisGrid = d3.svg.axis()
                        .scale(yAxisScale)
                        .orient('left');
                    graphLine = d3.svg.line()
                        .x(function(d) {return xAxisScale(d[0])})
                        .y(function(d) {return yAxisScale(d[1])});
                    $scope.svg = select('svg')
                    var focus = select('.focus');
                    select('.overlay')
                        .on('mouseover', function() { focus.style('display', null); })
                        .on('mouseout', function() { focus.style('display', 'none'); })
                        .on('mousemove', mouseMove);
                };

                $scope.load = function(json) {
                    var xPoints = linspace(json.x_range[0], json.x_range[1], json.points.length);
                    points = d3.zip(xPoints, json.points);
                    $scope.xRange = json.x_range;
                    xUnits = json.x_units;
                    xAxisScale.domain([json.x_range[0], json.x_range[1]]);
                    yAxisScale.domain([d3.min(json.points), d3.max(json.points)]);
                    select('.y-axis-label').text(json.y_label);
                    select('.x-axis-label').text(json.x_label);
                    select('.main-title').text(json.title);
                    select('.line').datum(points);
                    var dimensions = $scope.resize();
                    xPeakValues = computePeaks(json, dimensions, xPoints);
                };

                $scope.resize = function() {
                    if (! points)
                        return;
                    var width = parseInt(select().style('width')) - $scope.margin.left - $scope.margin.right;
                    var height = parseInt(select().style('height')) - $scope.margin.top - $scope.margin.bottom;
                    if (height > width)
                        height = width;
                    xAxisScale.range([-0.5, width - 0.5]);
                    yAxisScale.range([height - 0.5, 0 - 0.5]).nice();
                    xAxisGrid.tickSize(-height);
                    yAxisGrid.tickSize(-width);
                    select('.x.axis')
                        .attr('transform', 'translate(0,' + height + ')')
                        .call(xAxis);
                    select('.x.axis.grid')
                        .attr('transform', 'translate(0,' + height + ')')
                        .call(xAxisGrid); // tickLine == gridline
                    select('.y.axis')
                        .call(yAxis);
                    select('.y.axis.grid')
                        .call(yAxisGrid);
                    select('.main-title')
                        .attr('x', width / 2);
                    select('.y-axis-label')
                        .attr('x', - height / 2);
                    select('.x-axis-label')
                        .attr('x', width / 2)
                    // font height + 12 padding...
                        .attr('y', height + 26);
                    select('.plot-viewport')
                        .attr('width', width)
                        .attr('height', height);
                    select('svg .overlay')
                        .attr('width', width)
                        .attr('height', height)
                    select('.line')
                        .attr('d', graphLine);
                    return [width, height];
                };
            },
            link: function link(scope) {
                linkPlot(scope, d3Service, appState);
                scope.$on('$destroy', function() {
                    $(window).off('resize', scope.resize);
                    $('.overlay').off();
                    scope.svg.remove();
                    scope.svg = null;
                    scope.slider.off();
                    scope.slider.data('slider').picker.off();
                    scope.slider.remove();
                });
            },
        };
    });

    app.directive('plot3d', function(appState, d3Service) {
        return {
            restrict: 'A',
            scope: {
                modelName: '@',
                id: '@',
            },
            template: [
                '<div style="position: relative;">',
                '<canvas ng-attr-style="position: absolute; left: {{ margin }}px; top: {{margin }}px;" ng-attr-transform="translate({{ margin }},{{ margin }})"></canvas>',
                '<svg style="position: relative;">',
                  '<g ng-attr-transform="translate({{ margin }},{{ margin }})">',
                    '<text class="main-title" />',
                    '<rect class="mouse-rect" style="pointer-events: all; fill: none;" />',
                    '<line class="y-cross-hair cross-hair" y1="0" stroke-width="1" shape-rendering="crispEdges" stroke="steelblue" />',
                    '<line class="x-cross-hair cross-hair" x1="0" stroke-width="1" shape-rendering="crispEdges" stroke="steelblue" />',
                    '<g class="y axis grid"></g>',
                    '<defs>',
                      '<clippath id="bottomclip">',
                        '<rect class="bottom-panel-rect" />',
                      '</clippath>',
                    '</defs>',
                    '<g class="bottom-panel">',
                      '<path clip-path="url(#bottomclip)" />',
                      '<g class="x axis bottom"></g>',
                      '<g class="x axis grid"></g>',
                      '<text class="x-axis-label" />',
                      '<g class="y axis bottom"></g>',
                    '</g>',
                    '<defs>',
                      '<clippath id="rightclip">',
                        '<rect class="right-panel-rect" />',
                      '</clippath>',
                    '</defs>',
                    '<g class="right-panel">',
                      '<path clip-path="url(#rightclip)" />',
                      '<g class="y axis right"></g>',
                      '<g class="x axis right"></g>',
                      '<text class="y-axis-label" transform="rotate(270)" />',
                    '</g>',
                    '<text class="z-axis-label" />',
                  '</g>',
                '</svg>',
                '</div>',
            ].join(''),
            controller: function($scope) {

                $scope.margin = 50;
                var bottomPanelCutLine, bottomPanelXAxis, bottomPanelYAxis, bottomPanelYScale, canvas, canvasSize, ctx, heatmap, mainXAxis, mainYAxis, mouseRect, plotId, rightPanelCutLine, rightPanelXAxis, rightPanelYAxis, rightPanelXScale, rightPanelXScale, xAxisScale, xIndexScale, xValueMax, xValueMin, xValueRange, yAxisScale, yIndexScale, yValueMax, yValueMin, yValueRange;

                function drawBottomPanelCut() {
                    var bBottom = yIndexScale(yAxisScale.domain()[0]);
                    var yTop = yIndexScale(yAxisScale.domain()[1]);
                    var yv = Math.floor(bBottom + (yTop - bBottom + 1)/2);
                    var row = heatmap[yv];
                    var xvMin = xIndexScale.domain()[0];
                    var xvMax = xIndexScale.domain()[1];
                    var xiMin = Math.ceil(xIndexScale(xvMin));
                    var xiMax = Math.floor(xIndexScale(xvMax));
                    var xvRange = xValueRange.slice(xiMin, xiMax + 1);
                    var zvRange = row.slice(xiMin, xiMax + 1);
                    select('.bottom-panel path')
                        .datum(d3.zip(xvRange, zvRange))
                        .attr('class', 'line')
                        .attr('d', bottomPanelCutLine);
                }

                function drawRightPanelCut() {
                    var yvMin = yIndexScale.domain()[0];
                    var yvMax = yIndexScale.domain()[1];
                    var yiMin = Math.ceil(yIndexScale(yvMin));
                    var yiMax = Math.floor(yIndexScale(yvMax));
                    var xLeft = xIndexScale(xAxisScale.domain()[0]);
                    var xRight = xIndexScale(xAxisScale.domain()[1]);
                    var xv = Math.floor(xLeft + (xRight - xLeft + 1)/2);
                    var data = heatmap.slice(yiMin, yiMax + 1).map(function (v, i) {
                        return [yValueRange[i], v[xv]];
                    });
                    select('.right-panel path')
                        .datum(data)
                        .attr('class', 'line')
                        .attr('d', rightPanelCutLine);
                }

                function initDraw(json, zmin, zmax) {
                    var color = d3.scale.linear()
                        .domain([zmin, zmax])
                        .range(['#333', '#fff']);
                    var xmax = json.x_range.length - 1;
                    var ymax = json.y_range.length - 1;
                    // Compute the pixel colors; scaled by CSS.
                    var img = ctx.createImageData(json.x_range.length, json.y_range.length);
                    for (var yi = 0, p = -1; yi <= ymax; ++yi) {
	                for (var xi = 0; xi <= xmax; ++xi) {
	                    var c = d3.rgb(color(heatmap[yi][xi]));
	                    img.data[++p] = c.r;
	                    img.data[++p] = c.g;
	                    img.data[++p] = c.b;
	                    img.data[++p] = 255;
	                }
                    }
                    // Keeping pixels as nearest neighbor (as anti-aliased as we can get
                    // without doing more programming) allows us to see how the marginals
                    // line up when zooming in a lot.
                    ctx.mozImageSmoothingEnabled = false;
                    ctx.imageSmoothingEnabled = false;
                    ctx.msImageSmoothingEnabled = false;
                    ctx.imageSmoothingEnabled = false;
                    ctx.putImageData(img, 0, 0);
                    $scope.imageObj.src = canvas.node().toDataURL();
                }

                function refresh() {
                    var tx = 0, ty = 0, s = 1;
                    if (d3.event && d3.event.translate) {
                        var t = d3.event.translate;
                        s = d3.event.scale;
                        tx = t[0];
                        ty = t[1];
                        tx = Math.min(
                            0,
                            Math.max(
                                tx,
                                canvasSize - (s * $scope.imageObj.width) / ($scope.imageObj.width / canvasSize)));
                        ty = Math.min(
                            0,
                            Math.max(
                                ty,
                                canvasSize - (s * $scope.imageObj.height) / ($scope.imageObj.height / canvasSize)));

                        var xdom = xAxisScale.domain();
                        var ydom = yAxisScale.domain();
                        var resetS = 0;
                        if ((xdom[1] - xdom[0]) >= (xValueMax - xValueMin) * 0.9999) {
	                    $scope.zoom.x(xAxisScale.domain([xValueMin, xValueMax]));
	                    xdom = xAxisScale.domain();

	                    resetS += 1;
                        }
                        if ((ydom[1] - ydom[0]) >= (yValueMax - yValueMin) * 0.9999) {
	                    $scope.zoom.y(yAxisScale.domain([yValueMin, yValueMax]));
	                    ydom = yAxisScale.domain();
	                    resetS += 1;
                        }
                        if (resetS == 2) {
	                    mouseRect.attr('class', 'mouse-zoom');
	                    // Both axes are full resolution. Reset.
	                    tx = 0;
	                    ty = 0;
                        }
                        else {
	                    mouseRect.attr('class', 'mouse-move');
	                    if (xdom[0] < xValueMin) {
                                //		tx = 0;
	                        xAxisScale.domain([xValueMin, xdom[1] - xdom[0] + xValueMin]);
	                        xdom = xAxisScale.domain();
	                    }
	                    if (xdom[1] > xValueMax) {
	                        xdom[0] -= xdom[1] - xValueMax;
	                        xAxisScale.domain([xdom[0], xValueMax]);
	                    }
	                    if (ydom[0] < yValueMin) {
	                        yAxisScale.domain([yValueMin, ydom[1] - ydom[0] + yValueMin]);
	                        ydom = yAxisScale.domain();
	                    }
	                    if (ydom[1] > yValueMax) {
	                        ydom[0] -= ydom[1] - yValueMax;
	                        yAxisScale.domain([ydom[0], yValueMax]);
	                    }
                        }
                    }

                    ctx.clearRect(0, 0, canvasSize, canvasSize);
                    if (s == 1) {
                        tx = 0;
                        ty = 0;
                        $scope.zoom.translate([tx, ty]);
                    }
                    ctx.drawImage(
                        $scope.imageObj,
                        tx*$scope.imageObj.width/canvasSize,
                        ty*$scope.imageObj.height/canvasSize,
                        $scope.imageObj.width*s,
                        $scope.imageObj.height*s
                    );
                    drawBottomPanelCut();
                    drawRightPanelCut();
                    select('.bottom-panel .x.axis').call(bottomPanelXAxis);
                    select('.bottom-panel .y.axis').call(bottomPanelYAxis);
                    select('.right-panel .x.axis').call(rightPanelXAxis);
                    select('.right-panel .y.axis').call(rightPanelYAxis);
                    select('.x.axis.grid').call(mainXAxis);
                    select('.y.axis.grid').call(mainYAxis);
                }

                function select(selector) {
                    return d3.select(plotId + (selector ? (' ' + selector) : ''));
                }

                $scope.init = function(id) {
                    plotId = '#' + id;
                    xAxisScale = d3.scale.linear();
                    xIndexScale = d3.scale.linear();
                    yAxisScale = d3.scale.linear();
                    yIndexScale = d3.scale.linear();
                    bottomPanelYScale = d3.scale.linear();
                    rightPanelXScale = d3.scale.linear();
                    mainXAxis = d3.svg.axis()
                        .scale(xAxisScale)
                        .orient('bottom');
                    mainYAxis = d3.svg.axis()
                        .scale(yAxisScale)
                        .orient('left');
                    bottomPanelXAxis = d3.svg.axis()
                        .scale(xAxisScale)
                        .orient('bottom');
                    bottomPanelYAxis = d3.svg.axis()
                        .scale(bottomPanelYScale)
                    // this causes a 'number of fractional digits' error in MSIE
                    //.tickFormat(d3.format('e'))
                        .tickFormat(function (value) {
                            return value.toExponential();
                        })
                        .ticks(5)
                        .orient('left');
                    rightPanelXAxis = d3.svg.axis()
                        .scale(rightPanelXScale)
                    // this causes a 'number of fractional digits' error in MSIE
                    //.tickFormat(d3.format('e'))
                        .tickFormat(function (value) {
                            return value.toExponential();
                        })
                        .ticks(5)
                        .orient('bottom');
                    rightPanelYAxis = d3.svg.axis()
                        .scale(yAxisScale)
                        .orient('right');
                    $scope.zoom = d3.behavior.zoom()
                        .scaleExtent([1, 10])
                        .on('zoom', refresh);
                    canvas = select('canvas');
                    $scope.svg = select('svg g');
                    mouseRect = select('.mouse-rect');
                    ctx = canvas.node().getContext('2d');
                    $scope.imageObj = new Image();
                    $scope.imageObj.onload = function() {
                        // important - the image may not be ready initially
                        refresh();
                    };
                    bottomPanelCutLine = d3.svg.line()
                        .x(function(d) {return xAxisScale(d[0])})
                        .y(function(d) {return bottomPanelYScale(d[1])});
                    rightPanelCutLine = d3.svg.line()
                        .y(function(d) { return yAxisScale(d[0]); })
                        .x(function(d) { return rightPanelXScale(d[1]); });

                    $(window).resize($scope.resize);
                };

                $scope.load = function(json) {
                    heatmap = [];
                    var xmax = json.x_range.length - 1;
                    var ymax = json.y_range.length - 1;
                    xValueMin = json.x_range[0];
                    xValueMax = json.x_range[xmax];
                    xValueRange = json.x_range.slice(0);
                    yValueMin = json.y_range[0];
                    yValueMax = json.y_range[ymax];
                    yValueRange = json.y_range.slice(0);
                    xIndexScale.range([0, xmax]);
                    yIndexScale.range([0, ymax]);
                    canvas.attr('width', json.x_range.length)
                        .attr('height', json.y_range.length);
                    select('.main-title').text(json.title);
                    select('.x-axis-label').text(json.x_label);
                    select('.y-axis-label').text(json.y_label);
                    select('.z-axis-label').text(json.z_label);
                    xAxisScale.domain([xValueMin, xValueMax]);
                    xIndexScale.domain([xValueMin, xValueMax]);
                    yAxisScale.domain([yValueMin, yValueMax]);
                    yIndexScale.domain([yValueMin, yValueMax]);

                    var zmin = json.z_matrix[0][0]
                    var zmax = json.z_matrix[0][0]
                    for (var yi = 0; yi <= ymax; ++yi) {
                        // flip to match the canvas coordinate system (origin: top left)
                        // matplotlib is bottom left
                        heatmap[ymax - yi] = [];
                        for (var xi = 0; xi <= xmax; ++xi) {
	                    var zi = json.z_matrix[yi][xi];
	                    heatmap[ymax - yi][xi] = zi;
	                    if (zmax < zi)
	                        zmax = zi;
	                    else if (zmin > zi)
	                        zmin = zi;
                        }
                    }
                    bottomPanelYScale.domain([zmin, zmax]);
                    rightPanelXScale.domain([zmax, zmin]);
                    initDraw(json, zmin, zmax);
                    $scope.resize();
                };

                $scope.resize = function() {
                    var width = parseInt(select().style('width')) - 2 * $scope.margin;
                    var rightPanelMargin = {left: 10, right: 40};
                    var bottomPanelMargin = {top: 10, bottom: 30};
                    canvasSize = 2 * (width - rightPanelMargin.left - rightPanelMargin.right) / 3;
                    var bottomPanelHeight = 2 * canvasSize / 5 + bottomPanelMargin.top + bottomPanelMargin.bottom;
                    var rightPanelWidth = canvasSize / 2 + rightPanelMargin.left + rightPanelMargin.right;
                    xAxisScale.range([0, canvasSize - 1]);
                    yAxisScale.range([canvasSize - 1, 0]);
                    bottomPanelYScale.range([bottomPanelHeight - bottomPanelMargin.top - bottomPanelMargin.bottom - 1, 0]).nice();
                    rightPanelXScale.range([0, rightPanelWidth - rightPanelMargin.left - rightPanelMargin.right]).nice();
                    mainXAxis.tickSize(- canvasSize - bottomPanelHeight + bottomPanelMargin.bottom); // tickLine == gridline
                    mainYAxis.tickSize(- canvasSize - rightPanelWidth + rightPanelMargin.right); // tickLine == gridline
                    $scope.zoom.center([canvasSize / 2, canvasSize / 2])
                        .x(xAxisScale.domain([xValueMin, xValueMax]))
                        .y(yAxisScale.domain([yValueMin, yValueMax]));
                    select('canvas')
                        .style('width', canvasSize + 'px')
                        .style('height', canvasSize + 'px');
                    select('svg')
                        .attr('width', $scope.margin * 2 + canvasSize + rightPanelWidth)
                        .attr('height', $scope.margin * 2 + canvasSize + bottomPanelHeight)
                    select('.main-title')
                        .attr('x', canvasSize / 2)
                        .attr('y', - $scope.margin / 2);
                    select('.mouse-rect')
                        .attr('width', canvasSize)
                        .attr('height', canvasSize)
                        .call($scope.zoom);
                    select('.y-cross-hair')
                        .attr('x1', Math.floor(canvasSize/2) - 0)
                        .attr('x2', Math.floor(canvasSize/2) - 0)
                        .attr('y2', canvasSize);
                    select('.x-cross-hair')
                        .attr('y1', Math.floor(canvasSize/2) + 0)
                        .attr('x2', canvasSize)
                        .attr('y2', Math.floor(canvasSize/2) + 0);
                    select('.bottom-panel-rect')
                        .attr('width', canvasSize)
                        .attr('height', bottomPanelHeight - bottomPanelMargin.top - bottomPanelMargin.bottom);
                    select('.bottom-panel')
                        .attr('transform', 'translate(0,' + (canvasSize + bottomPanelMargin.top) + ')');
                    select('.x-axis-label')
                        .attr('x', canvasSize / 2)
                        .attr('y', bottomPanelHeight);
                    select('.right-panel-rect')
                        .attr('width', rightPanelWidth - rightPanelMargin.left - rightPanelMargin.right)
                        .attr('height', canvasSize);
                    select('.right-panel')
                        .attr('transform', 'translate(' + (canvasSize + rightPanelMargin.left) + ',0)');
                    select('.x.axis.bottom')
                        .attr('transform', 'translate(0,' + (bottomPanelHeight - bottomPanelMargin.top - bottomPanelMargin.bottom) + ')')
                        .call(bottomPanelXAxis);
                    select('.x.axis.right')
                        .attr('transform', 'translate(0,' + canvasSize + ')')
                        .call(rightPanelXAxis);
                    select('.y-axis-label')
                        .attr('x', - canvasSize / 2)
                        .attr('y', rightPanelWidth + 15);
                    select('.z-axis-label')
                        .attr('x', canvasSize + rightPanelWidth / 2)
                        .attr('y', canvasSize + $scope.margin);
                    var ticks = function(axis, axisRange, isShorterAxis) {
                        var spacing = isShorterAxis ? 150 : 80;
                        var n = Math.max(Math.round(canvasSize/spacing), 3);
                        axis.ticks(n);
                    };
                    ticks(rightPanelXAxis, true);
                    ticks(rightPanelYAxis, false);
                    ticks(bottomPanelXAxis, false);
                    ticks(bottomPanelYAxis, true);
                    ticks(mainXAxis, false);
                    ticks(mainYAxis, false);
                    select('.x.axis.grid')
                        .attr('transform', 'translate(0,' + (bottomPanelHeight - bottomPanelMargin.top - bottomPanelMargin.bottom) + ')')
                        .call($scope.zoom)
                        .call(mainXAxis);
                    select('.y.axis.grid')
                        .call($scope.zoom)
                        .call(mainYAxis);
                    select('.y.axis.right')
                        .attr('transform', 'translate(' + (rightPanelWidth - rightPanelMargin.left - rightPanelMargin.right) + ',0)')
                        .call(rightPanelYAxis);
                    select('.y.axis.bottom')
                        .call(bottomPanelYAxis);
                    refresh();
                };
            },
            link: function link(scope) {
                linkPlot(scope, d3Service, appState);
                scope.$on('$destroy', function() {
                    $(window).off('resize', scope.resize);
                    scope.zoom.on('zoom', null);
                    scope.svg.remove();
                    scope.svg = null;
                    scope.imageObj.onload = null;
                });
            },
        };
    });
})();