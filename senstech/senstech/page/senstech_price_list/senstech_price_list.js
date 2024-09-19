frappe.pages['senstech_price_list'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Preistabelle',
		single_column: true
	});
	
	// Set filters
	page.price_list_field = page.add_field({
		fieldname: 'price_list',
		label: __('Price List'),
		fieldtype: 'Link',
		options: 'Price List',
	});
	
	page.item_field = page.add_field({
		fieldname: 'item_code',
		label: __('Item'),
		fieldtype: 'Link',
		options: 'Item',
	});
	
	page.item_group_field = page.add_field({
		fieldname: 'item_group',
		label: __('Item Group'),
		fieldtype:'Link',
		options:'Item Group',
	});

	page.sales_field = page.add_field({
		fieldname: 'is_sales_item',
		label: __('Is sales item'),
		fieldtype:'Check',
	});
	
	page.purchase_field = page.add_field({
		fieldname: 'is_purchase_item',
		label: __('Is purchase item'),
		fieldtype:'Check',
	});
	
	// Set sorting options
	page.sort_selector = new frappe.ui.SortSelector({
		parent: page.wrapper.find('.page-form'),
		args: {
			sort_by: 'item_name',
			sort_order: 'asc',
			options: [
				{fieldname: 'item_name', label: __('Artikelbezeichnung')},
				{fieldname: 'item_code', label: __('Artikelcode')},
				{fieldname: 'price_1', label: __('Preis ab 1 Stk')},
				{fieldname: 'price_10', label: __('Preis ab 10 Stk')},
				{fieldname: 'price_20', label: __('Preis ab 20 Stk')},
			]
		},
	});

	// Initialize the table
	frappe.require('/assets/senstech/js/item_price_table.js', function() {
		page.item_price_table = new ItemPriceTable({
			parent: page.main,
		});

		page.item_price_table.before_refresh = function() {
			this.price_list = page.price_list_field.get_value();
			this.item_code = page.item_field.get_value();
			this.item_group = page.item_group_field.get_value();
			this.start = 0;
		};
		
		page.item_price_table.after_refresh = function() {
			
			// Update filters in case they were corrected by the server-side function
			if(this.price_list){
				page.price_list_field.set_input(this.price_list);
				page.purchase_field.set_input(this.is_purchase_item);
				page.sales_field.set_input(this.is_sales_item);
			}
		};

		// Item link: First click sets a filter, second click redirects to Item doc
		page.main.on('click', 'a[data-type=item]', function() {
			var name = $(this).attr('data-name');
			if(page.item_field.get_value()===name) {
				frappe.set_route('Form', 'Item', name);
			} else {
				page.item_field.set_input(name);
				page.item_price_table.refresh();
			}
		});
		
		// Catch both awesomplete-selectcomplete and change events as the latter fires when a field is cleared
		page.price_list_field.$input.on("awesomplete-selectcomplete", () => { price_list_field_changed(page) });
		page.price_list_field.$input.on("change", () => { price_list_field_changed(page)    });
		page.item_field.$input.on("awesomplete-selectcomplete", () => { item_field_changed(page, page.item_field); });
		page.item_field.$input.on("change", () => { item_field_changed(page, page.item_field); });
		page.item_group_field.$input.on("awesomplete-selectcomplete", () => { item_field_changed(page, page.item_group_field); });
		page.item_group_field.$input.on("change", () => { item_field_changed(page, page.item_group_field); });
		page.sales_field.$input.on("change", () => { checkbox_changed(page, page.sales_field); });
		page.purchase_field.$input.on("change", () => { checkbox_changed(page, page.purchase_field); });
		page.sort_selector.onchange = function(sort_by, sort_order) {
			page.item_price_table.sort_by = sort_by;
			page.item_price_table.sort_order = sort_order;
			page.item_price_table.refresh();
		};
		
		page.price_list_field.set_input(frappe.urllib.get_arg('price_list'));
		page.item_field.set_input(frappe.urllib.get_arg('item_code'));
		page.item_group_field.set_input(frappe.urllib.get_arg('item_group'));
		page.item_price_table.refresh();
	});
	
	page.main.on('change', 'input.price-list-field', function(ev) {
		// Remove any previous loading animation
		$(ev.target.nextElementSibling).remove();
		
		let item_code = ev.target.getAttribute("data-item-code");
		let min_qty = ev.target.getAttribute("data-min-qty");
		let rate = parseFloat(ev.target.value) || 0;
		let success_callback = () => {
			ev.target.classList.add('lds-done');
			$(ev.target.nextElementSibling).remove();
		};
		let error_callback = () => { $(ev.target.nextElementSibling).remove(); };
		
		if(item_code && min_qty) {
			// Show animation to indicate saving is in progress		
			ev.target.insertAdjacentHTML('afterend','<div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div>');
			page.item_price_table.save_price(item_code, min_qty, rate, success_callback, error_callback);
			if(rate>0)
				ev.target.value = Number(Math.round(parseFloat(rate + "e2")) + "e-2").toFixed(2);
			else
				ev.target.value = ""
		}
	});
	
	page.main.on('focus', 'input.price-list-field', function(ev) {
		ev.target.classList.remove('lds-done');
	});
}


function price_list_field_changed(page) {
	page.item_field.set_input("");
	page.item_group_field.set_input("");
	page.item_price_table.refresh();
}

function item_field_changed(page, changed_field) {
	let other_field = (changed_field == page.item_field ? page.item_group_field : page.item_field);
	other_field.set_input("");
	page.item_price_table.refresh();
}

function checkbox_changed(page, changed_field) {
	
	let other_field = (changed_field == page.sales_field ? page.purchase_field : page.sales_field);
	page.item_field.set_input("");
	page.item_group_field.set_input("");
	if(changed_field.get_value() == other_field.get_value()) {
		other_field.set_input(!changed_field.get_value());
	}
	if((changed_field == page.sales_field && changed_field.get_value()) || (changed_field == page.purchase_field && !changed_field.get_value())) {
		page.price_list_field.set_input(frappe.sys_defaults.selling_price_list);
	} else {
		page.price_list_field.set_input(frappe.sys_defaults.buying_price_list);
	}
	page.item_price_table.refresh();
}