'use strict';

angular.module('oneStopPlanner')
  .controller('LoginCtrl', [
    '$scope',
    '$state',
    '$mdDialog',
    'tryton',
    'session',
    function($scope, $state, $mdDialog, tryton, session) {
      $scope.login = {
        username : session.login,
        database : session.database,
        serverUrl : '/'
      };

      $scope.submit = function() {
        $scope.loggingIn = true;
        tryton.serverUrl = $scope.login.serverUrl;
        $scope.login.database = 'production'
        session.doLogin($scope.login.database, $scope.login.username, $scope.login.password)
          .success(function(result){
            if(result) {
              //Logged in
              $state.go('onestop');
            }
            else {
              $mdDialog.show(
                $mdDialog.alert()
                  .title('Login Failed!')
                  .content('Either username or password is wrong.')
                  .ariaLabel('Login Failed.')
                  .ok('Got it!')
              );
            }
          })
          .error(function(error){
            $mdDialog.show(
              $mdDialog.alert()
                .title('Login Failed!')
                .content(error)
                .ariaLabel('Login Failed.')
                .ok('Got it!')
            );
          })
          .finally(function () {
            $scope.loggingIn = false;
          });
      };
    }
  ]);
