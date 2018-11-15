 'use strict';

 angular.module('oneStopPlanner')
    .service('onestopService', [
    '$q',
    function ($q) {

    function getSunday(d) {
      d = new Date(d);
      var day = d.getDay(),
          diff = d.getDate() - day;
      return new Date(d.setDate(diff));
     }
    // Putting all the business logic in this service
    var method; 
    var params; 
    var context; 
    var col_defs;
    var items;
    var items_ids;
    var number_of_buckets;
    var bucket_size;
    var _server_url;
    var qoh = [];
    var grid;
    var row_data;
    var sales_row_data;
    var production_row_data;
    var grid_data;
    var sales_data;
    var shop_orders;
    var purchase_intermediate;
    var went_negative;

    function isInArray(value, array) {
      return array.indexOf(value) > -1;
    }

    var inputsAndOutputs = {

        productions : function (ids, start_date, end_date, detail, opts) {
            method = 'model.production.search_read'
            params = [[['product','in', ids],
                    ['state','in',['draft','plan','execute']]],null,null,null,['production_plan_code','product','quantity','quantity_done','planned_date']];

            if (start_date) {
                params[0].push(
            ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}],
            ['planned_date','>',{'__class__': 'date','year': start_date.getFullYear(),'month': start_date.getMonth()+1,'day': start_date.getDate()}])
            } else {
                params[0].push(
            ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}])
            }
            context = '';
            return session.rpc(method, params, context)
              .then (function(data) {
                 //   data.data = data.data.map(function(obj) {
                 //       obj['quantity'] = (obj['quantity_planned'] - obj['quantity_done'] < 0 ? 0 : obj['quantity_planned'] - obj['quantity_done'])
                 //   return obj
                 //   })
                return data;
            });
        },
        //TODO conflate 5- and 2- for Auriou
        purchases : function (ids, start_date, end_date, detail, opts) {
            method = 'model.stock.move.search_read'
            params = [[['product','in', ids],
                    ['from_location','=',5],
                    ['state','=','draft']],null,null,null,['origin','product','internal_quantity','planned_date']];
            if (start_date) {
                params[0].push(
            ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}],
            ['planned_date','>',{'__class__': 'date','year': start_date.getFullYear(),'month': start_date.getMonth()+1,'day': start_date.getDate()}])
            } else {
                params[0].push(
            ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}])
            }
            context = '';
            // need a second call to get the purchase orders due to the origin column
            // not showing the PO number TODO refactor this. can get PO from origin.
            return session.rpc(method, params, context)
              .then (function(data) {
                var move_data = data;
                var ids = data.data.map(function(obj){
                        obj['id'] = parseInt(obj['origin'].split(',')[1]);
                    return obj['id']
                    });
                method = 'model.purchase.line.search_read';
                params = [[['id','in',ids]],null,null,null,['product','quantity','purchase']];
                context = '';
                return session.rpc(method, params, context)
                  .then (function(data1) {
                    var lookup = {};
                    for (var i = 0, len = data1.data.length; i < len; i++) {
                        lookup[data1.data[i].id] = data1.data[i];
                    }
                    data.data = data.data.map(function(obj) {
                        obj['purchase'] = lookup[obj['id']]['purchase']
                        return obj
                    })
                     // rewrite method as it's used later
                     data.config.data.method = "model.purchase.purchase.search_read"
                     return  data;

                  });


              });
        },


        forecasts : function (ids, start_date, end_date, detail, opts) {
            // This will require a few calls due to the
            // forecastline.stock.move.rel table
            if (detail) {
                method = 'model.stock.forecast.line.search_read';
                params = [[['product','in',ids]]
                ,null,null,null,['forecast', 'product', 'quantity', 'moves']];
                context = '';
                return session.rpc(method, params, context)
                  .then (function(data) {
                        return data
                 });

            } else {

                method = 'model.stock.forecast.line.search_read';
                params = [[['product','in',ids],
                ['forecast.state','=','done']],null,null,null,['forecast', 'product', 'quantity', 'moves']];
                context = '';
                return session.rpc(method, params, context)
                  .then (function(data) {
                  //   var ids = data.data.map(function(obj) {
                  //      return obj['moves']
                  //      })
                    var moves = data.data.reduce(function(previousValue, currentValue, index, array){
                                if (currentValue.moves.length > 0) {
                                    previousValue = previousValue.concat(currentValue['moves'])
                                    return previousValue
                                } else { return previousValue }
                           },[]);
                   //  Putting in this map because there is no way to get the origin
                   //  of a forecast move line as you can with a shipment.
                   //  var move_fline_map = data.data.map(function(obj){

                   //      obj['forecast_line'] = obj['id']
                   //      obj['moves']
                   //  })
                     method = 'model.stock.move.search_read';
                     params = [[['id','in',moves]]];
                    if (start_date) {
                        params[0].push(
                    ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}],
                    ['planned_date','>',{'__class__': 'date','year': start_date.getFullYear(),'month': start_date.getMonth()+1,'day': start_date.getDate()}])
                    } else {
                        params[0].push(
                    ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}])
                    }
                    context = '';
                    return session.rpc(method, params, context)
                      .then (function(data1) {
                        data1.config.data.method = "model.stock.forecast.line.search_read"
                        return data1
                  });
           });
          }
        },


        sales : function (ids, start_date, end_date, detail, opts) {
            // TODO chnge returned fields based on detail or aggregate view.
            method = 'model.stock.move.search_read';
            params = [[['product','in',ids],
            ['shipment','ilike','stock.shipment.out,%'],
            ['to_location','=',2],
            ['state','in',['draft','assigned']]],null,null,null,['shipment', 'product','internal_quantity','planned_date', 'shipment.customer.name', 'shipment.customer.categories']];
            // If no start date then look at all
            if (start_date) {
                params[0].push(
            ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}],
            ['planned_date','>',{'__class__': 'date','year': start_date.getFullYear(),'month': start_date.getMonth()+1,'day': start_date.getDate()}])
            } else {
                params[0].push(
            ['planned_date','<=',{'__class__': 'date','year': end_date.getFullYear(),'month': end_date.getMonth()+1,'day': end_date.getDate()}])
            }
            context = '';
            return session.rpc(method, params, context)
              .then (function(data) {
                // rewrite shipment.customer.name for binding properly in grid
                // shouldn't mutate original array TODO
                data.data.map(function(obj){ 
                    obj['customer'] =  obj['shipment.customer.name'];
                    delete obj['shipment.customer.name']
                    return obj
                    })
                // Let's filter customer classes, cuz domains can't do it, I think.
                if (opts.wholesale && !opts.retail) {
                    var f_data = data.data.filter(function(obj) {
                       return isInArray(9, obj['shipment.customer.categories'])
                    })  
                    data.data = f_data;
                }
                
                if (!opts.wholesale && opts.retail) {
                    var f_data = data.data.filter(function(obj) {
                       return !isInArray(9, obj['shipment.customer.categories'])
                    })
                    data.data = f_data;
                }
                // rewrite method as it's used later, must also add appropriate id of the shipment
                // These are both used to form hyperlink in the cell template for showModal.
                data.config.data.method = "model.stock.shipment.out.search_read"
                // reformat data depending on whether detail view or aggregate view
                if (detail) {
                
                    data.data.map(function(obj){
                        obj['id'] = obj['shipment'].split(',')[1];
                        delete obj['shipment']
                        delete obj['shipment.customer.categories']
                        delete obj['product']


                        return obj
                    })

                }
                return data

              })

        },

        quantities : function (ids) {
            method = 'model.product.product.products_by_location'
            params = [[3], items_ids]
            var stock_end_date = new Date();
            context = {'stock_date_start' : null, 
                      'stock_date_end': {
                          "__class__":"date",
                          "year":stock_end_date.getFullYear(),
                          // Whoever the fuck did this should be punished!
                          // 0 based index for months ? what the fuck is next ? (courtesy of Sharoon :)
                          "month":stock_end_date.getMonth() + 1,
                          "day": stock_end_date.getDate()
                      }
                }
            return session.rpc(method, params, context)
        }
    };


    this.getBucketDetails = function (key, item, s_date, e_date, opts) {
    //TODO get rid of this function and call insandouts directly
        var id = [item];
        return inputsAndOutputs[key](id, s_date, e_date, true,  opts)
     }

    this.getCategories = function (parents) {
        method = 'model.product.category.search_read'
        params = [[['active','=','True']],null,null,null,['name','parent','childs']]
        context = '';
        return session.rpc(method, params, context)
    }



    this.getProducts = function (categories) {
        method = 'model.product.product.search_read'
        params = [[['active','=','True'],['template.category','in',categories]],null,null,null,['code', 'rec_name']]
        context = '';
        return session.rpc(method, params, context)
    }

    this.getData = function(period_size, no_of_buckets, ins_and_outs, customer_class, bucket_filter, items) {
        items_ids = items.map(function(obj){ 
                    return obj['id'];
                    })

        grid_data = [];
        number_of_buckets = no_of_buckets;
        bucket_size = period_size;
        var from_date = getSunday(new Date());   
        var start_date =  from_date;
        var end_date = new Date(start_date.getFullYear(), start_date.getMonth(), start_date.getDate()+bucket_size*number_of_buckets);
        // Get inputs and outputs and store in memory
        var ins_and_outs_prom = {quantities : inputsAndOutputs["quantities"](items_ids)};
        for (var property in ins_and_outs) {
            if (ins_and_outs.hasOwnProperty(property)) {
                if (ins_and_outs[property].state === true) {
                    if (property == 'sales') {
                        ins_and_outs_prom[property] = inputsAndOutputs[property](items_ids, null, end_date, false, customer_class);
                    } else {
                        ins_and_outs_prom[property] = inputsAndOutputs[property](items_ids, null, end_date, false, {});
                    }
                }
            }
        } 
      return  $q.all(ins_and_outs_prom)
        .then(function(data) {

            // Subtract inputs and outputs in each bucket
            // and return grid
                col_defs = [{name:"Item" ,  end : getSunday(new Date()), cellTemplate : 
                ' <div layout="row" class="ui-grid-cell-contents">' +
                    '<md-button class="btn1" type="button" ng-click="grid.appScope.showModal(row, col)">' +
                    '{{row.entity[col.field]}}<br>{{row.entity.extText}}' +
                    '</md-button>' +
                '</div>'}];
                var item_data = {};
                var start_date = getSunday(new Date());   
                // Iterate over items
                for (var i=0; i < items.length; i++) {
                    went_negative = false;
                    item_data['row'] = {};
                    item_data['row']["$$treeLevel"] =  0;
                    item_data['row']["Item"] = items[i]['code'];
                    var quantity_on_hand = typeof data['quantities'].data[3][items[i]['id']] == "undefined" ? 0 : data['quantities'].data[3][items[i]['id']] 
                    item_data['row']["extText"] = "QoH: " + quantity_on_hand.toString();
                    // Build first column  with past due
                    // iterate over keys in data
                    for (var key in data) {
                        // don't reduce quantities.
                        if (key != 'quantities') {
                            item_data[key] = {};
                            item_data[key]["$$treeLevel"] = 1;
                            var past_due = data[key].data.reduce(function(previousValue, currentValue, index, array){
                                    if (currentValue['product'] == items[i]['id'] && new Date(currentValue['planned_date']) < start_date) {
                                        // Must normalize quantity field TODO better way? yeah.... fix it in inputsAndOutputs functions.
                                        return previousValue + (typeof currentValue['internal_quantity'] == "undefined" ? currentValue['quantity'] : currentValue['internal_quantity'])
                                    } else { return previousValue }
                               },0);
                        
                            item_data[key]['Item'] = key
                            item_data[key]["extText"] = "Past Due: " + past_due.toString();
                            item_data[key]['parent'] = items[i]['id'];
                            // HACK! TODO get rid of this later
                            if (key == 'sales') {
                                quantity_on_hand -= past_due
                            }
                        }
                    }
                    var from_date = start_date;

                    // Iterate over periods
                    for (var period = 1; period <= number_of_buckets; period++) {
                         var end_date = new Date(from_date.getFullYear(), from_date.getMonth(), from_date.getDate()+bucket_size);
                        // Write column defs
                        if (col_defs.length < number_of_buckets+1) {
                            col_defs.push(bucket_size === 6 ? 
                                {name:from_date.toLocaleDateString() + "    \n To     \n" + end_date.toLocaleDateString(), field:'bucket'+period.toString(), start: from_date, end: end_date,
                                    cellClass: function(grid, row, col, rowRenderIndex, colRenderIndex) {
                                        if (grid.getCellValue(row,col) < 0) {
                                            return 'went_negative';
                                        }
                                        if (row.entity.$$treeLevel == 1) { 
                                            return 'pleasing_offset';
                                        }
                                    }, cellTemplate : 
                                        ' <div layout="row" class="ui-grid-cell-contents">' +
                                            '<md-button class="btn1" type="button" ng-click="grid.appScope.showModal(row, col)">' +
                                            '{{row.entity[col.field]}}' +
                                            '</md-button>' +
                                        '</div>'

                                }
                                : {name:from_date.toLocaleDateString(), field:'bucket'+period.toString()});
                                }
                        // End writing column defs

                       // Iterate over keys and build column for bucket
                        for (key in data) {
                            // don't reduce quantities.
                            if (key != 'quantities') {
                                item_data[key]['bucket'+period.toString()] = 
                                 data[key].data.reduce(function(previousValue, currentValue, index, array){
                                        if (currentValue['product'] == items[i]['id'] && new Date(currentValue['planned_date'])>= from_date && new Date(currentValue['planned_date'])<= end_date ) {
                                            return previousValue + (typeof currentValue['internal_quantity'] == "undefined" ? currentValue['quantity'] : currentValue['internal_quantity'])
                                        } else { return previousValue }
                                   },0);
                                if (ins_and_outs[key].type == 'input') {
                                    quantity_on_hand += item_data[key]['bucket'+period.toString()];
                                } else {
                                    quantity_on_hand -= item_data[key]['bucket'+period.toString()];
                                }
                            } 
                       }
                        item_data['row']["bucket"+period.toString()] = quantity_on_hand;
                        if (quantity_on_hand < 0) {
                            went_negative = true
                        }

                        from_date = new Date(from_date.getFullYear(), from_date.getMonth(), from_date.getDate()+bucket_size+1);
                    }
                    if (!bucket_filter.active) {
                        for (var io in item_data) {
                        
                            grid_data.push(item_data[io]);
                        }
                    } else if (went_negative) {
                        for (var io in item_data) {
                        
                            grid_data.push(item_data[io]);
                        }

                    }
                }
                return {columnDefs:col_defs, data:grid_data}
            });
    } //close getData
}]);

