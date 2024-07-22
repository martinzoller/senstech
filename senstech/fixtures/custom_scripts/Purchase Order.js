frappe.ui.form.on('Purchase Order', {
    before_save(frm) {
		if (!frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_supplier(frm);
		}
	},
	after_save(frm) {
		if (!frm.doc.__islocal) {
		    var items = new Array();
            frm.doc.items.forEach(function(entry) {
            	if (entry.item_code != null) {
            		items.push(entry.item_code);
            	} 
            });
		    frappe.call({
            	method: 'senstech.scripts.tools.transfer_item_drawings',
            	args: {
			dt: 'Purchase Order',
            		dn: frm.doc.name,
            		items: items
            	},
            	callback: function(r) {
            	    if (r.message > 0) {
            	        frm.reload_doc();
            	    }
            	}
            });
		}
	},
    onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    supplier(frm) {
        if (!frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_supplier(frm);
            }, 1000);
        }
    },
	currency(frm) {
        // Non-standard currency, or price list was changed: Assign the appropriate price list for this currency
        if(frm.doc.currency != frappe.sys_defaults.currency || frm.doc.buying_price_list != frappe.sys_defaults.buying_price_list) {
            frappe.db.get_list("Price List", {fields: ['name'], filters: {enabled: true, buying: true, currency: frm.doc.currency}}).then(f => {
                if(f.length == 1) {
                    frm.set_value('buying_price_list', f[0]['name']);
					frappe.show_alert({message: __('Währungswechsel: Preisliste \'{0}\' zugewiesen', [frm.doc.buying_price_list]), indicator: 'green'}, 5);
                }
                else {
                    frappe.show_alert({message: __('Keine eindeutige Einkaufs-Preisliste für Währung \'{0}\' definiert', [frm.doc.currency]), indicator: 'orange'}, 10);
                }
			});
        }		
	},
    validate(frm) {
		basic_purchasing_validations(frm);
    },
    refresh(frm) {
		frm.set_query("item_code", "items", function() {
				return{
					query: "erpnext.controllers.queries.item_query",
					filters: {'is_purchase_item': 1, 'item_code': ['not like', 'AC-%']}
				}
		});

        if (frm.doc.supplier_address && frm.doc.shipping_address) {
            update_address_display(frm, ['address_display', 'shipping_address_display'], [frm.doc.supplier_address, frm.doc.shipping_address], true);
        } else {
            if (frm.doc.supplier_address) {
                update_address_display(frm, 'address_display', frm.doc.supplier_address, false);
            }
            if (frm.doc.shipping_address) {
                update_address_display(frm, 'shipping_address_display', frm.doc.shipping_address, false);
            }
        }
	},
    before_submit(frm) {
        frm.doc.submitted_by = frappe.user.name;
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});

frappe.ui.form.on('Purchase Order Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});