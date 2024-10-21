frappe.ui.form.on('Sales Order', {
    before_save(frm) {
	    fetch_templates_from_customer(frm);
		update_customer_data(frm);
	},
    customer(frm) {
        setTimeout(function(){
            fetch_templates_from_customer(frm);
			project_query(frm);
        }, 1000);
    },
	currency(frm) {
        assign_price_list_by_currency(frm);
	},
    validate(frm) {
		basic_sales_validations(frm);
		frm.doc.items.forEach(entry => {
			let pos_prefix = __("Pos. {0}: ",[entry.position]);
			
			// Entwicklungsauftrag: Offertenreferenz prüfen
			if(entry.item_code == 'GP-00001') {
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
			
			// Nullserieentwicklung: Serieartikel prüfen
			if(entry.item_code == 'GP-00003' && frm.doc.project) {
				let dev_item_part = frm.doc.project.substr(2,7)+'00'; // z.B. '-272-0100'
				if(!frm.doc.items.some(i => i.item_code.includes(dev_item_part))) {
					validation_error(frm, 'items', pos_prefix+__("Die AB einer Nullserieentwicklung muss den jeweiligen Serieartikel bereits enthalten (noch ohne Gate-2-Freigabe). Dessen Artikelcode muss dem Schema '{0}' entsprechen.",['XX'+dev_item_part]));
				}
			}
		});
		
        reload_contacts(frm);
    },
    after_save(frm) {
        calculate_versanddatum(frm);
    },
    refresh(frm) {
		if(!frm.doc.__islocal) {
			let auto_batch_items = frm.doc.items.filter(f => (f.item_group.startsWith("Serieprodukte") || f.item_code == "GP-00002"));
			if(auto_batch_items.length == 1) {
				if(auto_batch_items[0].item_code == "GP-00002"){
					frm.add_custom_button(__('Produktionscharge anlegen'), function() {
						frappe.new_doc("Batch", {
							batch_type: 'Lohnfertigung/Kleinauftrag',
							item: 'GP-00002',
							sales_order: frm.doc.name
						});
					});
				} else {
					frm.add_custom_button(__('Produktionscharge anlegen'), function() {
						frappe.new_doc("Batch", {
							batch_type: 'Serieprodukt',
							item: auto_batch_items[0].item_code
						});
					});
				}
			}
		}
        if (frm.doc.customer_address && frm.doc.shipping_address_name) {
            update_address_display(frm, ['address_display', 'shipping_address'], [frm.doc.customer_address, frm.doc.shipping_address_name], true);
        } else {
            if (frm.doc.customer_address) {
                update_address_display(frm, 'address_display', frm.doc.customer_address);
            }
            if (frm.doc.shipping_address_name) {
                update_address_display(frm, 'shipping_address', frm.doc.shipping_address_name);
            }
        }
        setTimeout(function(){
            reformat_delivery_dates(frm);
        }, 1000);
        if(frm.doc.__islocal) {
            // ggf. Kundendaten abrufen
			if(frm.doc.items){
				if(frm.doc.items[0].blanket_order) {
					setTimeout(function(){
						fetch_templates_from_blanket_order(frm, frm.doc.items[0].blanket_order);
					}, 1000);
				}
			}
            if (!frm.doc.taxes_and_charges || !frm.doc.payment_terms_template){
                setTimeout(function(){
                    fetch_templates_from_customer(frm);
                }, 1000);
            }
			// Workaround: Steuern bei AB-Anlegen aus Rahmenauftrag korrekt laden
            if(frm.doc.taxes_and_charges && (!frm.doc.taxes || frm.doc.taxes.length == 0)) {
                frm.script_manager.trigger('taxes_and_charges');
            }
            // ggf. Position der 1. Zeile korrekt setzen (Bugfix, offenbar wird diese Zeile neu automatisch erzeugt?)
            if(frm.doc.items) {
                if(frm.doc.items[0].position == 0) {
                    frappe.model.set_value(frm.doc.items[0].doctype,frm.doc.items[0].name,'position',10);
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
        frm.doc.submitted_by = frappe.user.name;
    },
	on_submit(frm) {
		// ggf. Dialog zum Aktualisieren von Listenpreisen anzeigen
		update_list_prices(frm);
	},	
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});


frappe.ui.form.on('Sales Order Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
	},
	price_list_rate(frm, cdt, cdn) {
		// When a new item is selected, price_list_rate is triggered after the details have been fetched => Item-specific code can go here
		let current_item = locals[cdt][cdn];
		if(current_item.blanket_order) {
			fetch_templates_from_blanket_order(frm, current_item.blanket_order);
		}
	}
});

handle_custom_uom_fields('Sales Order');


function calculate_versanddatum(frm) {
    frappe.call({
        "method": "senstech.scripts.sales_order_tools.calculate_versanddatum",
        "args": {
            "so": frm.doc.name
        },
        "callback": function(response) {
            if (response.message == 'updated') {
                frm.reload_doc();
            }
        }
    });
}


function fetch_templates_from_customer(frm) {
	if(!frm.doc.customer) {
        return;
    }

    frappe.db.get_doc("Customer", frm.doc.customer).then(customer => {
        if(customer) {
    		if (!frm.doc.taxes_and_charges && customer.taxes_and_charges) {
    				frm.set_value('taxes_and_charges', customer.taxes_and_charges);
    		}
    		if(!frm.doc.payment_terms_template && customer.payment_terms){
    				frm.set_value('payment_terms_template', customer.payment_terms);
    		}
        }
    });
}


function fetch_templates_from_blanket_order(frm, blanket_order) {
    console.log('BOfetch');

    frappe.db.get_doc("Blanket Order", blanket_order).then(bo => {
        if(bo) {
    		if(bo.payment_terms) {
					frm.set_value('payment_terms_template', '');
    				frm.set_value('payment_terms_template', bo.payment_terms);
					frappe.show_alert({message: __("Zahlungsbedingungen aus Rahmenauftrag übernommen:")+' '+bo.payment_terms, indicator: 'green'}, 10);
    		}
        }
    });
}


// Hack the date selector to show a two-digit instead of four-digit year, so that the full date fits into a size-1 table column
function reformat_delivery_dates(frm) {
    let target = frm.fields_dict.items.$wrapper.find('.grid-body .data-row div.col[data-fieldname="delivery_date"]');
    
    target.each(function(index){
        let static_area = $(this).find('.static-area')[0];
        $(static_area).text(reformat_delivery_date($(static_area).text()));
        
    	let newObserver = new MutationObserver( (chgs) => {
    	    if(chgs.length > 0 && chgs[0].addedNodes.length > 0){
    	        let node = chgs[0].addedNodes[0];
    	        if(node.innerHTML && node.innerHTML.startsWith('<input')) {
    	            $(node.firstChild).on('blur', f => {
	                    setTimeout(() => {
	                        $(f.target).val(reformat_delivery_date($(f.target).val()));
	                    }, 200);
    	            });
					setTimeout(() => {
						$(node.firstChild).val(reformat_delivery_date($(node.firstChild).val()));
					}, 200);
    	        } else if (node.nodeValue) {
                        $(static_area).text(reformat_delivery_date(node.nodeValue));
    	        }
    	    }
        });
        newObserver.observe(this, {subtree: true, childList: true});
    });
}

function reformat_delivery_date(date) {
    if (date.match(/^\d{2}.\d{2}.\d{4}$/)) {
        return date.substr(0,6)+date.substr(8,2);
    } else {
        return date;
    }
}