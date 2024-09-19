// Adaptation of erpnext.stock.ItemDashboard

ItemPriceTable = Class.extend({
	init: function(opts) {
		$.extend(this, opts);
		this.make();
	},
	make: function() {
		var me = this;
		this.start = 0;
		if(!this.sort_by) {
			this.sort_by = 'item_name';
			this.sort_order = 'asc';
		}

		this.content = $(frappe.render_template('item_price_table')).appendTo(this.parent);
		this.result = this.content.find('.result');

		// more
		this.content.find('.btn-more').on('click', function() {
			me.start += 100;
			me.refresh();
		});

	},
	refresh: function() {
		if(this.before_refresh) {
			this.before_refresh();
		}
		
		if(this.price_list || this.item_code || this.item_group) {
			var me = this;
			frappe.call({
				method: 'senstech.senstech.page.senstech_price_list.item_price_table.get_data',
				args: {
					price_list: this.price_list,
					item_code: this.item_code,
					item_group: this.item_group,
					start: this.start,
					sort_by: this.sort_by,
					sort_order: this.sort_order,
				},
				callback: function(r) {
					me.render(r.message);
				}
			});	
		} else {
			this.render('');
		}
	},
	render: function(msg) {
		if(this.start===0) {
			this.result.empty();
		}

		var context = this.get_price_table_data(msg);
		this.buying = context.buying;

		// show more button
		if(context.data && context.data.length===101) {
			this.content.find('.more').removeClass('hidden');

			// remove the last element
			context.data.splice(-1);
		} else {
			this.content.find('.more').addClass('hidden');
		}

		if (context.data.length > 0) {
			$(frappe.render_template('item_price_table_rows', context)).appendTo(this.result);
		} else {
			var message = __("No data to show")
			if(!this.price_list && !this.item_code && !this.item_group) {
				message = __("Please select a filter criterion");
			}
			else if(!context.has_list_price) {
				message = __("This item group does not have list prices");
			}
			$("<span class='text-muted small'>"+message+"</span>").appendTo(this.result);
		}
		
		if(this.after_refresh) {
			this.after_refresh();
		}
	},
	get_price_table_data: function(msg) {

		var can_write = 0;
		if(frappe.boot.user.can_write.indexOf("Item Price")>=0){
			can_write = 1;
		}

		if(msg) {
			some_price_breaks = msg.data.some(d => (d.has_price_breaks));
			
			// Update filter parameters
			this.price_list = msg.price_list;
			this.is_purchase_item = msg.is_purchase_item;
			this.is_sales_item = msg.is_sales_item;
			
			return {
				data: msg.data,
				has_list_price: msg.has_list_price,
				currency: msg.currency,
				can_write: can_write,
				some_price_breaks: some_price_breaks
			};
		}
		else {
			return {
				data: [],
				currency: 'NONE',
				can_write: can_write
			};
		}
	},
	
	save_price: function(item_code, min_qty, rate, success_callback, error_callback) {
		frappe.call({
			method: 'senstech.senstech.page.senstech_price_list.item_price_table.set_item_price',
			args: {
				price_list: this.price_list,
				item_code: item_code,
				min_qty: min_qty,
				rate: rate
			},
			callback: function(r) {
				if(r.message == 'success') {
					success_callback && success_callback();
				} else {
					error_callback && error_callback();
				}
			},
			error: function(r) {
				error_callback && error_callback();
			}
		});
	}
})