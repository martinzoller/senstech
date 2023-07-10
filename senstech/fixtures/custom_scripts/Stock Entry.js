frappe.ui.form.on('Stock Entry', {
	validate(frm) {
		check_batch_release(frm);
	},
	refresh(frm) {
		frm.add_custom_button(__("Entnahme Blech"), function() {
            entnahme_blech(frm);
        });
	},
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    }
})

function check_batch_release(frm) {
    var items = cur_frm.doc.items;
	items.forEach(function(entry) {
        if (entry.batch_no) {
		    frappe.call({
			    method: "frappe.client.get",
			    args: {
			        "doctype": "Item",
					"name": entry.item_code
			    },
                callback: function(response) {
					var item = response.message;
					frappe.call({
					   method: "frappe.client.get",
					   args: {
							"doctype": "Batch",
							"name": entry.batch_no
					   },
					   callback: function(response) {
							var batch = response.message;
							if (item.benoetigt_chargenfreigabe && !batch.freigabedatum) {
								validation_error('items', __("Die Charge ") + entry.batch_no + __(" (Zeile #") + entry.idx + __(") ist noch nicht freigegeben."));
							}

							if (entry.t_warehouse == 'Fertigerzeugnisse - ST') {
                                frappe.call({
                                    method: 'senstech.scripts.tools.check_for_batch_quick_stock_entry',
		        		            args: {
    				                    item: entry.item_code,
	    				                batch_no: entry.batch_no,
		    			                warehouse: entry.t_warehouse
        				            },
				                    callback: (r) => {
				                        var open_qty = batch.stueckzahl - r.message.entry_qty
                                        if(entry.qty > open_qty) {
            								validation_error('items', __("Die Charge ") + entry.batch_no + __(" (Zeile #") + entry.idx + __(") würde mit dieser Buchung ihre Maximalstückzahl überschreiten."));
            				            }
								    }
			                    });
                            }
					   }
					});
                }
			});
		}
    });
}


function entnahme_blech(frm) {
	var d = new frappe.ui.Dialog({
		'fields': [
			{fieldname: 'scan_item', fieldtype: 'Link', options: 'Item', label: __("Item"), reqd: 1,
				change: function() {
					var item = d.get_values().scan_item;
					if (item) {
						frappe.call({
						   method: "senstech.scripts.stock_entry_tools.entnahme_blech",
						   args: {
								"item": item
						   },
						   callback: function(response) {
								if (response.message.error) {
									frappe.msgprint(response.message.error, __("Error"));
								} else {
									var item_qty = response.message.qty;
									var item_stock_uom = response.message.stock_uom;
									var item_conversion_factor = response.message.conversion_factor;
									if (item_qty) {
										cur_dialog.fields_dict["qty_in_default_stock_uom"].set_value(item_qty);
										cur_dialog.fields_dict["qty_in_default_stock_uom"].set_label("Quantity in " + item_stock_uom);
									} else {
										cur_dialog.fields_dict["qty_in_default_stock_uom"].set_value('1');
									}
									if (item_stock_uom) {
										cur_dialog.fields_dict["default_stock_uom"].set_value(item_stock_uom);
									} else {
										cur_dialog.fields_dict["default_stock_uom"].set_value('Stk');
									}
									if (item_conversion_factor) {
										cur_dialog.fields_dict["conversion_factor_to_default_stock_uom"].set_value(item_conversion_factor);
									} else {
										cur_dialog.fields_dict["conversion_factor_to_default_stock_uom"].set_value('1');
									}
								}
						   }
						});
					}
				}
			},
			{fieldname: 'section_qty', fieldtype: 'Section Break', label: __("Quantity")},
			{fieldname: 'qty', fieldtype: 'Float', label: __("Quantity in Stk"), default: '1.000',
				change: function() {
					var new_qty_in_default_stock_uom = d.get_values().qty * d.get_values().conversion_factor_to_default_stock_uom;
					cur_dialog.fields_dict["qty_in_default_stock_uom"].set_value(new_qty_in_default_stock_uom);
				}
			},
			{fieldname: 'break_qty', fieldtype: 'Column Break'},
			{fieldname: 'qty_in_default_stock_uom', fieldtype: 'Float', label: __("Quantity in Default Stock UOM"), default: '1.000', read_only: 1},
			{fieldname: 'section_stock_uom', fieldtype: 'Section Break', label: __("Lagerdetails")},
			{fieldname: 'default_stock_uom', fieldtype: 'Data', label: __("Default Stock UOM"), read_only: 1},
			{fieldname: 'break_stock_uom', fieldtype: 'Column Break'},
			{fieldname: 'conversion_factor_to_default_stock_uom', fieldtype: 'Data', label: __("Conversion Factor to Stk"), read_only: 1},
			{fieldname: 'section_defaults', fieldtype: 'Section Break', label: __("Defaults")},
			{fieldname: 'stock_entry_type', fieldtype: 'Link', label: __("Stock Entry Type"), default: __('Material Issue'), options: 'Stock Entry Type'},
			{fieldname: 'break_defaults', fieldtype: 'Column Break'},
			{fieldname: 'from_warehouse', fieldtype: 'Link', label: __("Default Source Warehouse"), default: __('Lagerräume - ST'), options: 'Warehouse'},
		],
		primary_action: function(){
			d.hide();
			submit_entnahme_blech(frm, d.get_values());
		},
		primary_action_label: __('Submit')
	});
	d.show();
}

function submit_entnahme_blech(frm, values) {
	// set defaults
	cur_frm.set_value("stock_entry_type", values.stock_entry_type);
	cur_frm.set_value("from_warehouse", values.from_warehouse);
	
	// remove all rows
	var tbl = frm.doc.items || [];
	var i = tbl.length;
	while (i--)
	{
		cur_frm.get_field("items").grid.grid_rows[i].remove();
	}
	
	// add item row
	var child = cur_frm.add_child('items');
	frappe.model.set_value(child.doctype, child.name, 'item_code', values.scan_item);
	frappe.model.set_value(child.doctype, child.name, 'qty', values.qty);
	frappe.model.set_value(child.doctype, child.name, 'uom', 'Stk');
	frappe.model.set_value(child.doctype, child.name, 'conversion_factor', values.conversion_factor_to_default_stock_uom);
	frappe.model.set_value(child.doctype, child.name, 'transfer_qty', values.qty_in_default_stock_uom);
	frappe.model.set_value(child.doctype, child.name, 'allow_zero_valuation_rate', 1);
	cur_frm.refresh_field('items');
	
	cur_frm.save().then(() => {
		cur_frm.savesubmit();
	});
}