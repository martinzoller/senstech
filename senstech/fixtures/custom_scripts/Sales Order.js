frappe.ui.form.on('Sales Order', {
    before_save(frm) {
	    fetch_templates_from_customer(frm);
		update_customer_data(frm);
	},
    customer(frm) {
        setTimeout(function(){
            fetch_templates_from_customer(frm);
        }, 1000);
    },
    validate(frm) {
		basic_sales_validations(frm);
		frm.doc.items.forEach(entry => {
			// Entwicklungsauftrag: Offertenreferenz prüfen
			if(entry.item_code == 'GP-00001') {
				let pos_prefix = __("Pos. {0}: ",[entry.position]);
				if(!entry.prevdoc_docname) {
					validation_error(frm, 'items', pos_prefix+__("Die AB für Entwicklungsaufträge muss aus der jeweiligen Offerte erzeugt werden."));
				} else {
					frappe.db.get_value("Quotation", entry.prevdoc_docname, "gate1_review_result").then(r => {
						if(!r.message || r.message.gate1_review_result != "Gate 1 erreicht") {
							validation_error(frm, 'items', pos_prefix+__("Die verknüpfte Offerte ist nicht freigegeben."));
						}
					});
				}
			}
		});
        reload_contacts(frm);
    },
    after_save(frm) {
        calculate_versanddatum(frm);
    },
    refresh(frm) {
        if (cur_frm.doc.customer_address && cur_frm.doc.shipping_address_name) {
            update_address_display(frm, ['address_display', 'shipping_address'], [cur_frm.doc.customer_address, cur_frm.doc.shipping_address_name], true);
        } else {
            if (cur_frm.doc.customer_address) {
                update_address_display(frm, 'address_display', cur_frm.doc.customer_address);
            }
            if (cur_frm.doc.shipping_address_name) {
                update_address_display(frm, 'shipping_address', cur_frm.doc.shipping_address_name);
            }
        }
        setTimeout(function(){
            // Lieferdatum kürzer darstellen
            reformat_delivery_dates();
        }, 1000);
        if(cur_frm.doc.__islocal) {
            // ggf. Kundendaten abrufen
			if(cur_frm.doc.items){
				if(cur_frm.doc.items[0].blanket_order) {
					setTimeout(function(){
						fetch_templates_from_blanket_order(frm, cur_frm.doc.items[0].blanket_order);
					}, 1000);
				}
			}
            if (!cur_frm.doc.taxes_and_charges || !cur_frm.doc.payment_terms_template){
                setTimeout(function(){
                    fetch_templates_from_customer(frm);
                }, 1000);
            }
            // ggf. Position der 1. Zeile korrekt setzen (Bugfix, offenbar wird diese Zeile neu automatisch erzeugt?)
            if(cur_frm.doc.items) {
                if(cur_frm.doc.items[0].position == 0) {
                    frappe.model.set_value(cur_frm.doc.items[0].doctype,cur_frm.doc.items[0].name,'position',10);
                }
            }
        }
    },
	onload(frm) {
		project_query(frm);
	},
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    before_submit(frm) {
        cur_frm.doc.submitted_by = frappe.user.name;
    },
    on_submit(frm) {
		// Chargen werden serverseitig angelegt und hier nur abgefragt
		frappe.db.get_list("Batch", { fields: ['batch_id'], filters: { batch_id: ['LIKE', cur_frm.docname+"-P%A"] }}).then(res => {
			res.forEach(row => {
				frappe.show_alert({message: __("Produktionscharge für Entwicklungsauftrag wurde automatisch angelegt:")+' <a href="#Form/Batch/'+row.batch_id+'">'+row.batch_id+'</a>', indicator: 'green'}, 10);
			});
		});
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});


frappe.ui.form.on('Sales Order Item', {
    item_code: function(frm, cdt, cdn) {
		// Verhindern, dass bei Artikelwechsel die "Marge" des alten zum Preis des neuen Artikels addiert wird
        frappe.model.set_value(cdt, cdn, "margin_rate_or_amount", "0");		
        var current_item = locals[cdt][cdn];
        setTimeout(function(){
            if(current_item.blanket_order) {
                fetch_templates_from_blanket_order(frm, current_item.blanket_order);
            }
        }, 1000);
    },
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
	}
});




function calculate_versanddatum(frm) {
    frappe.call({
        "method": "senstech.scripts.sales_order_tools.calculate_versanddatum",
        "args": {
            "so": cur_frm.doc.name
        },
        "callback": function(response) {
            if (response.message == 'updated') {
                cur_frm.reload_doc();
            }
        }
    });
}


function fetch_templates_from_customer(frm) {
	if(!cur_frm.doc.customer) {
        return;
    }

    frappe.db.get_doc("Customer", cur_frm.doc.customer).then(customer => {
        if(customer) {
    		if (!cur_frm.doc.taxes_and_charges && customer.taxes_and_charges) {
    				cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
    		}
    		if(!cur_frm.doc.payment_terms_template && customer.payment_terms){
    				cur_frm.set_value('payment_terms_template', customer.payment_terms);
    		}
        }
    });
}


function fetch_templates_from_blanket_order(frm, blanket_order) {
    console.log('BOfetch');

    frappe.db.get_doc("Blanket Order", blanket_order).then(bo => {
        if(bo) {
    		if(bo.taxes_and_charges) {
					cur_frm.set_value('taxes_and_charges', '');
    				cur_frm.set_value('taxes_and_charges', bo.taxes_and_charges);
    		}
    		if(bo.payment_terms) {
					cur_frm.set_value('payment_terms_template', '');
    				cur_frm.set_value('payment_terms_template', bo.payment_terms);
    		}
        }
    });
}


function reformat_delivery_dates() {
    $('div[data-fieldname="delivery_date"] > .static-area:visible').each(function(index){
        var date4 = $(this).text();
        if (date4.match(/^\d{2}.\d{2}.\d{4}$/)) {
            $(this).text(date4.substr(0,6)+date4.substr(8,2));
        }
    });
}