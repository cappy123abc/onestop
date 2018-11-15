'use strict';

angular
  .module(
    'oneStopPlanner', [
        'ngMaterial',
      'ui.router',
      'ui.grid',
      'ui.grid.treeView',
      'ui.grid.autoResize',
      'n3-line-chart',
      'treeControl',
      'LocalStorageModule'
    ]
  )
  .config(function($stateProvider, $urlRouterProvider, $mdThemingProvider, $compileProvider) {
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https):/);
    $urlRouterProvider
      .when('', '/')
      .otherwise('/404');

    $stateProvider
      .state('404', {
        url: '/404',
        templateUrl: 'views/404.html'
      })

      .state('onestop', {
        url: '/',
        templateUrl: 'views/one_stop.html',
        controller: 'onestopController',
      });

  })

  .config(function($mdThemingProvider){
      $mdThemingProvider
        .theme('default')
        .primaryPalette('blue')
        .accentPalette('pink')
        .warnPalette('red');

  });  
