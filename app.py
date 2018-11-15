import os
from fulfil_client import Client
from flask import Flask, jsonify, request, render_template, Blueprint
from flask_login import login_required
from flask_principal import Principal, Permission, RoleNeed
import collections
import datetime
import sqlite3


DB_STRING =  'forecasts.sqlite'
app_path = os.path.dirname(__file__)
database_path = os.path.join(app_path, DB_STRING)
client = Client('lie-nielsen', os.environ['FULFIL_API_KEY'])
# Switch the two lines below for production or debug.
app = Blueprint('onestop', __name__, url_prefix="/onestop", template_folder="templates")
#app = Blueprint('onestop', __name__, url_prefix="/onestop", template_folder="templates", static_url_path = "", static_folder="")

analytics_permission = Permission(RoleNeed('Analytics'))

Production = client.model('production')
ProductionPlan = client.model('production.plan')
Product = client.model('product.product')
LNConfig = client.model('ln.configuration')
StockMove = client.model('stock.move')
WorkCenter = client.model('production.work.center')
Sale = client.model('sale.sale')
Purchase = client.model('purchase.purchase')
Category = client.model('product.category')

def get_productions(ids, start_date=None, end_date=None, detail=False, opt={}):
    # productions don't get a planned date upon creation.
    domain = [('product','in', ids),
               ('state','in',['draft','waiting','running'])]
    if start_date :
        domain.extend([
        ('planned_date','<=', end_date),
        ('planned_date','>', start_date)])
    else :
        domain.append(('OR',
        [('planned_date','<=', end_date)],
        [('planned_date','=',None)],))
    # n.append((['OR',[('planned_date','<=', end_date)],[('planned_date','=',None)]],))
    productions = Production.search_read(domain,None,None,None,
               ['state','production_plan_code','product','quantity','quantity_remaining','planned_date'] )
    for production in productions :
        # for some reason, productions in draft have a qty remaining of 0
        production['quantity'] = production['quantity_remaining'] or production['quantity']
        if not production['planned_date'] :
            production['planned_date'] = datetime.date.today() - datetime.timedelta(datetime.date.weekday(datetime.datetime.today()) + 2)
    if detail :
        model = 'production'
        productions.append(model)
    return productions

def get_sales(ids, start_date=None, end_date=None, detail=False, opts={}):
    domain = [('product','in',ids),
    ('shipment','ilike','stock.shipment.out,%'),
    ('to_location','=',2),
    ('state','in',['draft','waiting','assigned'])]
    # If no start date then look at all
    if start_date :
        domain.extend(
        [('planned_date','<', end_date),
        ('planned_date','>=', start_date)])
    else :
        domain.append(
        ('planned_date','<',end_date))
    sales = StockMove.search_read(domain,None,None,None,['shipment', 'product','internal_quantity','planned_date', 'shipment.customer.name', 'shipment.customer.categories'])
    for sale in sales :
        sale['customer'] = sale['shipment.customer.name']
        sale['quantity'] = sale['internal_quantity']
        sale['model_id'] = sale['shipment'].split(',')[1]
    # Let's filter customer classes, cuz domains can't do it, I think.
    if opts['wholesale'] and  not opts['retail'] : 
        sales = filter(lambda x : 9 in x['shipment.customer.categories'], sales)
    elif not opts['wholesale'] and opts['retail'] :
        sales = filter(lambda x : 9 not in x['shipment.customer.categories'], sales)
    if detail :
        for sale in sales :
            sale['id'] = sale['shipment'].split(',')[1]
            sale.pop('shipment')
            sale.pop('shipment.customer.categories')
            sale.pop('product')
        # Add the model to the returned data for forming hyperlinks in the grid
        # The Model we want to look up is not necessarily the model we queried.
        model = 'stock.shipment.out'
        sales.append(model)
        return sales
    return sales

def get_purchases(ids, start_date=None, end_date=None, detail=False, opts={}):
    domain = [('product','in', ids),
             ('from_location','=',5),
             ('state','=','draft')]
    if start_date :
        domain.extend([
	        ('planned_date','<=', end_date),
	        ('planned_date','>', start_date)])
    else :
		domain.append(
	        ('planned_date','<=', end_date))
    purchases = StockMove.search_read(domain,None,None,None,['origin', 'origin.purchase', 'product','internal_quantity','planned_date'])
    for purchase in purchases :
        purchase['quantity'] = purchase['internal_quantity']
        purchase['id'] = purchase['origin.purchase']
    if detail : 
        model =  'purchase.purchase'
        purchases.append(model)
    return purchases

def get_forecasts(ids, start_date=None, end_date=None, detail=False, opt={}):
    """
    Quick and dirty for now
    """
    with sqlite3.connect(database_path) as c :
        try:
            forecasts = c.execute("select * from quicky where product in (%s)" % ','.join('?'*len(ids)), ids).fetchall()
            # distribute forecasts between start and end datea using daily rate
            # and create a planned date field
            # There is no concept of past due forecast at this point
            if detail :
                model = 'product.forecast'
                forecasts = [dict(zip(['Product ID','Daily Build','Weekly Build','Annual Forecast'], forecasts[0]))]
                forecasts.append(model)
                return forecasts
            else : 
                if not start_date :
                    start_date = datetime.date.today() 
                forecast_return = []
                deltadays = (end_date - start_date).days + 1
                # for daily forecasts that are less than 1/day drop weekly forecast in on Monday
                for forecast in forecasts :
                    for day_number in range(deltadays):
                        planned_date = (start_date + datetime.timedelta(days = day_number))
                        if forecast[1] >= 1 :
                            forecast_return.append({'product':forecast[0], 'planned_date':planned_date, 'quantity':forecast[1]})
                        else :
                            if planned_date.weekday() == 0 :
                                forecast_return.append({'product':forecast[0], 'planned_date':planned_date, 'quantity':forecast[2]})
                return forecast_return
        except:
            return
            


def get_quantities(item_ids=[]):
    params = [[3], item_ids]
    stock_end_date = datetime.date.today()
    context = {'stock_date_start' : None, 'stock_date_end': stock_end_date}
    quantities = Product.products_by_location([3], item_ids, context=context)
    return quantities

inputs_and_outputs = {
    'sales' : get_sales,
    'purchases' : get_purchases,
    'productions' : get_productions,
    'forecasts' : get_forecasts,
    'quantities' : get_quantities
    }

def get_products(categories):
    products = Product.search_read([('active','=','True'),('salable','=','True'),('type','=','goods'),('account_category','in',categories)])
    return products

@app.route('/')
@login_required
@analytics_permission.require(http_exception=403)
def index():
    return render_template('onestop/index.html')

@app.route("/get_categories")
@login_required
@analytics_permission.require(http_exception=403)
def categories():
    categories = Category.search_read([('active','=','True')],None,None,None,['name','parent','childs'])
    return jsonify(categories)

@app.route("/get_bucket_details", methods=['GET', 'POST'])
@login_required
@analytics_permission.require(http_exception=403)
def bucket_details() :
    args = request.get_json()
    id = [args['item']]
    end_date = datetime.datetime.strptime(args['e_date'],'%a, %d %b %Y %H:%M:%S %Z') 
    if args.has_key('s_date') :
        start_date = datetime.datetime.strptime(args['s_date'],'%a, %d %b %Y %H:%M:%S %Z') 
    else  : start_date = None
    return jsonify(inputs_and_outputs[args['key']](id, start_date, end_date, True, args['opts']))

@app.route("/get_grid", methods=['GET', 'POST'])
@login_required
@analytics_permission.require(http_exception=403)
def grid():
    """
    Return data for ui-grid
    """
    def past_due_reduce (x,y) :
        if y['product'] == product['id'] and y['planned_date'] < start_date :
            # Some productions don't have a qty - go figure! SNAFU
            if not y['quantity'] : y['quantity'] = 0
            return x + y['quantity']
        else : return x

    def bucket_reduce (x,y) :
        if y['product'] == product['id'] and y['planned_date'] >= from_date and y['planned_date'] <= end_date :
            # Same fucked up situation as above
            if not y['quantity'] : y['quantity'] = 0
            return x + y['quantity']
        else : return x

    # Get all the requested inputs and outputs for the selected items
    args = request.get_json()
    grid_data = []
    item_data = {}
    io = {}
    from_date = datetime.date.today() - datetime.timedelta(datetime.date.weekday(datetime.datetime.today()) + 1)    
    start_date = from_date
    end_date = start_date + datetime.timedelta(days=args['period_size']*args['no_of_buckets'])
    products = get_products(args['cat_ids'])
    item_ids = [ x['id'] for x in products ]
    io['quantities'] = get_quantities(item_ids)
    # The idea here is to iterate over products and then periods
    # Will do calls to pull all input and output data at once rather than alot
    # of calls for each bucket.
    for k, v in args['ins_and_outs'].iteritems() :
        if v['state'] :
            io[k] = inputs_and_outputs[k](item_ids, None, end_date, False, args['customer_class'])   
    col_defs = [{'name':'Item' ,'width' : 200, 'end' : start_date, 'cellTemplate' :
    ' <div layout="row" class="ui-grid-cell-contents">' +
        '<md-button class="btn1" type="button" ng-click="grid.appScope.showModal(row, col)">' +
        '{{row.entity[col.field]}}<br>{{row.entity.extText}}' +
        '</md-button>' +
    '</div>'}]
    for product in products :
        went_negative = False
        below_threshold = False
        with sqlite3.connect(database_path) as c :
            annual_forecast = c.execute("select total_for_year from quicky where product = ?", (product['id'],)).fetchone()
        # Give a value for missing rows. TODO send msg to client warning of missing fcast
        if not annual_forecast : annual_forecast = (1,)
        item_data['row'] = {}
        item_data['row']["$$treeLevel"] =  0
        item_data['row']["Item"] = product['code']
        if io['quantities']['3'].has_key(str(product['id'])) :
            quantity_on_hand = io['quantities']['3'][str(product['id'])] 
        else : quantity_on_hand = 0
        item_data['row']["extText"] = "QoH: " + str(quantity_on_hand)
        # Build first column  with past due
        # iterate over keys in data
        for key in io.iterkeys() :
            # don't reduce quantities.
            if key != 'quantities' :
                item_data[key] = {}
                item_data[key]["$$treeLevel"] = 1
                past_due = reduce(past_due_reduce, io[key], 0)
                item_data[key]['Item'] = key
                item_data[key]["extText"] = "Past Due: " + str(past_due)
                item_data[key]['parent'] = product['id']
                # HACK! TODO get rid of this later
                if key == 'sales' :
                    quantity_on_hand -= past_due
        from_date = start_date
        # Iterate over periods
        for period in range(0,args['no_of_buckets']) :
            end_date = from_date + datetime.timedelta(days=args['period_size'])
			# Write column defs
            if len(col_defs) < args['no_of_buckets']+1 :
				col_defs.append( 
					{'name':str(from_date) + "    \n To     \n" + str(end_date), 'field':'bucket'+str(period), 'start': from_date, 'end': end_date,
				#		'cellClass': function(grid, row, col, rowRenderIndex, colRenderIndex) {
				#			if (grid.getCellValue(row,col) < 0) {
				#				return 'went_negative';
				#			}
				#			if (row.entity.$$treeLevel == 1) { 
				#				return 'pleasing_offset';
				#			}},
					       'cellTemplate' : 
							' <div layout="row" class="ui-grid-cell-contents">' +
								'<md-button class="btn1" type="button" ng-click="grid.appScope.showModal(row, col)">' +
								'{{row.entity[col.field]}}' +
								'</md-button>' +
							'</div>'})
            for key in io.iterkeys() :
				# don't reduce quantities.
                if key != 'quantities' :
                    item_data[key]['bucket'+str(period)] = reduce(bucket_reduce, io[key], 0)
                    if args['ins_and_outs'][key]['type'] == 'input' : 
                        quantity_on_hand += item_data[key]['bucket'+str(period)]
                    else :
                        quantity_on_hand -= item_data[key]['bucket'+str(period)]
            forecast_percent = quantity_on_hand/(annual_forecast[0] or 1)*100
            if args['bucket_filter']['type'] == 'forc' :
                item_data['row']["bucket"+str(period)] = round(forecast_percent)
                if forecast_percent < args['bucket_filter']['thresh'] :
                    below_threshold = True
            else :
                item_data['row']["bucket"+str(period)] = quantity_on_hand
                if quantity_on_hand < 0 :
                    went_negative = True
            from_date = from_date + datetime.timedelta(days=args['period_size']+1)
        # This below shit ain't complete TODO deal with bucket filters
        if not  args['bucket_filter']['active'] :
            for x in sorted(item_data.items(), key=lambda x :  x[1]['$$treeLevel']) :
                grid_data.append(x[1])
        elif args['bucket_filter']['type'] == 'forc' and below_threshold :
            for x in sorted(item_data.items(), key=lambda x :  x[1]['$$treeLevel']) :
                grid_data.append(x[1])
        elif args['bucket_filter']['type'] == 'inv' and went_negative :
            for x in sorted(item_data.items(), key=lambda x :  x[1]['$$treeLevel']) :
                grid_data.append(x[1])
    return jsonify({'columnDefs':col_defs, 'data':grid_data})


if __name__ == "__main__":

    app.debug = True
    app.run(host='0.0.0.0', port=8091)
