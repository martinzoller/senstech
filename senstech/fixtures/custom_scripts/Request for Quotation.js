frappe.ui.form.on('Request for Quotation', {
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
					dt: 'Request for Quotation',
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
    validate(frm) {
		basic_purchasing_validations(frm);
    },
    refresh(frm) {
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

frappe.ui.form.on('Request for Quotation Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});