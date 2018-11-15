 'use strict';

 angular.module('oneStopPlanner')
    .controller('onestopController', [
    '$http',
    '$rootScope',
    '$scope',
    'uiGridTreeViewConstants',
    '$interval',
    '$mdDialog',
    '$mdSidenav',
    function ($http, $rootScope, $scope, uiGridTreeViewConstants, $interval, $mdDialog, $mdSidenav) {
       $scope.showMfg = buildToggler('right');
       $scope.progress = false;
         $scope.toggleSidenav = function(menuId) {
             $mdSidenav(menuId).toggle();
         }


        $scope.treeOptions = {
            dirSelectable: true,
            multiSelection : true,
            injectClasses: {
                ul: "a1",
                li: "a2",
                liSelected: "a7",
                iExpanded: "a3",
                iCollapsed: "a4",
                iLeaf: "a5",
                label: "a6",
                labelSelected: "a8"
            }
        }

      $scope.onChange = function(type) {
        if (type == 'mfg') {
            var parents = [154, 20, 165];
            $scope.ins_and_outs.sales.state = true;
            $scope.ins_and_outs.forecasts.state = true;
            $scope.ins_and_outs.productions.state = true;
            $scope.ins_and_outs.purchases.state = false;
            } else {
            var parents = [15]
            $scope.ins_and_outs.sales.state = true;
            $scope.ins_and_outs.forecasts.state = true;
            $scope.ins_and_outs.productions.state = false;
            $scope.ins_and_outs.purchases.state = true;
            }


         $http.get('/onestop/get_categories')
            .then(function(data) {
                $scope.categories = listToTree(data.data);
            })
      };

       $scope.isOpenRight = function(){
         return $mdSidenav('right').isOpen();
       };
       $scope.periods = {
           num: 0
       };

      $scope.modal_grid = {
        onRegisterApi: function (gridApi) {
          $scope.gridApi = gridApi;

          }
      };

       $scope.outlook_grid  = {
           rowHeight : 55,
           enableSorting: true,
           enableFiltering: true,
           showTreeExpandNoChildren: false
       };
        $scope.bucket_size = "Weeks";      
        $scope.planning_types = {type : 'mfg'};
        $scope.bucket_filter = {'active' : false, 'type' : ''};
        $scope.no_of_buckets = 8;
        $scope.customer_class = {'wholesale' : true,
                                 'retail' : true}
 //       $scope.customer_class.retail = true;
        $scope.ins_and_outs = {'productions' : {type : 'input', state : true}, 
                               'sales' : {type : 'output', state : true}, 
                               'forecasts' : {type : 'output', state : true}, 
                               'purchases' : {type : 'input', state : false}}

         $http.get('/onestop/get_categories')
          .then(function(data) {
             $scope.categories = listToTree(data.data);
          })

        function buildToggler(navID) {
          return function() {
            $mdSidenav(navID)
              .toggle()
          }
        }

    $scope.catSelected = function (sel, state) {
        // select all sub nodes
        //$scope.cat_sel = sel.children
        //$scope.cat_sel.push(sel)
    }



    $scope.runStockOutlook = function () {   
    var period_size = $scope.bucket_size === "Weeks" ? 6 : 1;
    //TODO accept multiple ids
    var cat_ids = $scope.cat_sel.map(function(obj){
        return obj['id']
    });
    $scope.progress = true;
        // Make grid
        $http.post('/onestop/get_grid',{period_size : period_size, 
                                no_of_buckets : $scope.no_of_buckets, 
                                ins_and_outs : $scope.ins_and_outs, 
                                customer_class : $scope.customer_class, 
                                bucket_filter : $scope.bucket_filter, 
                                cat_ids : cat_ids})
          .then(function(data) {
            $scope.progress = false;
            $scope.outlook_grid.data = data.data.data;
            // add cell class to column defs
            for (var i = 0 , len = data.data.columnDefs.length; i < len; i++ ) {
					data.data.columnDefs[i]['cellClass'] =  function(grid, row, col, rowRenderIndex, colRenderIndex) {
                            if (row.treeLevel == 1) { 
                                return 'pleasing_offset';
                            }
                            if ($scope.bucket_filter['active']) {
							    if (((grid.getCellValue(row,col) < 0 && $scope.bucket_filter['type'] == 'inv') || 
                                    (grid.getCellValue(row,col) < $scope.bucket_filter['thresh'] && $scope.bucket_filter['type'] == 'forc')) && 
                                    row.treeLevel == 0) {
								return 'went_negative';
                                }
                            } else {
                                 console.log(grid.getCellValue(row,col))
                                 if (grid.getCellValue(row,col) < 0) {
                                     return 'went_negative';
                                 }
                            }
							}}
            $scope.outlook_grid.columnDefs = data.data.columnDefs;
          })
      .catch (function(data) {
        console.log('error', JSON.stringify(data));
      });
    }

  $scope.selectItemsClose = function () {
      $mdSidenav('right').close()
  }



  $scope.showModal = function(r, c) {
    var product = r.entity.parent;
    var start_date = c.colDef.start;
    var end_date = c.colDef.end;
    var metric = r.entity.Item
    $http.post('/onestop/get_bucket_details',{ key : metric,
                             s_date : start_date,
                             e_date : end_date,
                             item : product,
                             opts : $scope.customer_class })
    // TODO normalize how data is returned so I don't need this function, IN A RUSH!
      .then( function(data) {
        var col_defs = []
        var mod = data.data.pop()
        // Change date format into something sortable
        data.data = data.data.map(function(obj) {
            obj['planned_date'] = new Date(obj['planned_date'])
            return obj
        })
        // Temporary work around until forecasts are in Fulfil
        if (mod == 'product.forecast') {
        }
        for ( var key in data.data[0]) {
            if ( key == 'id') {
                var cell_template = '<a href="https://lie-nielsen.fulfil.io/client/#/model/' + mod + '/{{row.entity.id}}" target="_blank">{{row.entity.id}}</a>';
                col_defs.push ({name : key, cellTemplate : cell_template})
            } else {
                col_defs.push ({name : key})
            }

        }
        $scope.modal_grid.data = data.data;
        $scope.modal_grid.columnDefs = col_defs;

           var parentEl = angular.element(document.body);
       $mdDialog.show({
         parent: parentEl,
         scope: $scope,        
          preserveScope: true,
       //  targetEvent: $event,
         template:
           '<md-dialog aria-label="List dialog">' +
           '  <md-dialog-content style="width:950px;height:810px; ">'+
           '     <div id="grid1" ui-grid="modal_grid" class="grid" style="height:500px">' +
           '  </md-dialog-content>' +
           '  <md-dialog-actions>' +
           '    <md-button ng-click="closeDialog()" class="md-primary">' +
           '      Close Dialog' +
           '    </md-button>' +
           '  </md-dialog-actions>' +
           '</md-dialog>',
         locals: {
            grid : $scope.modal_grid
         },
         controller: DialogController
      });
      function DialogController($scope, $mdDialog) {
        $scope.closeDialog = function() {
          $mdDialog.hide();
        }
      }
  });
  }
}]);

