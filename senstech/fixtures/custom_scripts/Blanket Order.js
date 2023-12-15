frappe.ui.form.on('Blanket Order', {
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    },
    before_save(frm) {
        if(cur_frm.doc.bis_auf_weiteres) {
            cur_frm.doc.to_date = "2099-12-31";
        }
    },
    refresh(frm) {
		if (cur_frm.doc.docstatus == 1) {
            frm.add_custom_button(__("Change To Date"), function() {
                change_to_date(frm);
            });
            // Adress-, Kontakt-, Steuer- und Konditionsfeld bei gebuchten R'aufträgen noch änderbar, wenn nicht gesetzt (Legacy)
            if(cur_frm.doc.customer_address){
                cur_frm.set_df_property('customer_address','read_only',1);
            }
            if(cur_frm.doc.contact_person){
                cur_frm.set_df_property('contact_person','read_only',1);
            }
            if(cur_frm.doc.taxes_and_charges){
                cur_frm.set_df_property('taxes_and_charges','read_only',1);
            }
            if(cur_frm.doc.payment_terms){
                cur_frm.set_df_property('payment_terms','read_only',1);
            }
            // Neue Felder in Item-Tabelle ebenfalls schreibschützen, wenn Werte gesetzt und gebucht
            if(cur_frm.doc.items) {
                // Der Einfachheit halber nur 1. Zeile beachten
                // (Legacy Rahmenaufträge haben alle nur 1 Zeile und ohnehin kann Schreibschutz nur für ganze Tabelle gesetzt werden)
                cur_frm.fields_dict.items.grid.toggle_enable('lot_size', cur_frm.doc.items[0].lot_size === 0);
                cur_frm.fields_dict.items.grid.toggle_enable('min_stock_qty', cur_frm.doc.items[0].min_stock_qty === 0);
                cur_frm.fields_dict.items.grid.toggle_enable('rate_custom', false);
                // Zudem Preis aus Feld "rate" in "rate_custom" übernehmen, wenn dieses noch leer ist
                frappe.model.set_value('Blanket Order Item',cur_frm.doc.items[0].name,'rate_custom',cur_frm.doc.items[0].rate);
                // refresh erübrigt sich, da nachher in change_customer() zwingend die items-Liste refresht wird
                //cur_frm.fields_dict.items.grid.refresh_row(cur_frm.doc.items[0].name);
            }
        }
        change_customer(frm);
        if (cur_frm.doc.customer_address) {
		    update_address_display(frm, 'address_display', cur_frm.doc.customer_address);
        }
	},
	customer(frm) {
        change_customer(frm);
	},
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    },
    validate(frm) {
        basic_sales_validations(frm);
    }
});


frappe.ui.form.on('Blanket Order Item', {
	rate_custom(frm, cdt, cdn) {
	    var current_item = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, 'rate', current_item.rate_custom);
   }
});


function change_to_date(frm) {
    frappe.prompt([
        {'fieldname': 'date', 'fieldtype': 'Date', 'label': __('New To Date'), 'reqd': 1, 'default': cur_frm.doc.to_date},
        {'fieldname': 'bis_auf_weiteres', 'fieldtype': 'Check', 'label': __('Bis auf Weiteres gültig'), 'default': cur_frm.doc.bis_auf_weiteres }
    ],
    function(values){
        frappe.call({
            "method": "senstech.scripts.blanket_order_tools.change_blanket_order_to_date",
            "args": {
                "bo": cur_frm.doc.name,
                "date": values.date,
                "bis_auf_weiteres": values.bis_auf_weiteres
            },
            "async": false,
            "callback": function(response) {
                cur_frm.reload_doc();
            }
        });
    },
    __('Change To Date'),
    __('Change')
    );
}


function change_customer(frm) {
    if(!cur_frm.doc.customer) {
        cur_frm.set_query('customer_address', () => {
          return {
            query: 'frappe.contacts.doctype.address.address.address_query',
            filters: {
            	link_doctype: 'Customer',
            	link_name: ''
            }
          };
        });
        cur_frm.set_query('contact_person', () => {
          return {
            query: 'frappe.contacts.doctype.contact.contact.contact_query',
            filters: {
            	link_doctype: 'Customer',
            	link_name: ''
            }
          };
        });
        return;
    }
    cur_frm.set_query('customer_address', () => {
      return {
        query: 'frappe.contacts.doctype.address.address.address_query',
        filters: {
        	link_doctype: 'Customer',
        	link_name: cur_frm.doc.customer
        }
      };
    });
    cur_frm.set_query('contact_person', () => {
      return {
        query: 'frappe.contacts.doctype.contact.contact.contact_query',
        filters: {
        	link_doctype: 'Customer',
        	link_name: cur_frm.doc.customer
        }
      };
    });
    frappe.db.get_doc("Customer", cur_frm.doc.customer).then(customer => {
        if(customer) {
            var new_currency = customer.default_currency || frappe.defaults.get_global_default('currency');
            if(cur_frm.doc.currency != new_currency){
                cur_frm.set_value('currency', new_currency);
            }
            // Diesen Refresh in jedem Fall ausführen, da sonst teils Darstellungsprobleme auftreten (Preis z.B. "2" statt "CHF 2.00")
            cur_frm.refresh_field('items');
            var new_language = customer.language || frappe.defaults.get_global_default('language');
            if(cur_frm.doc.language != new_language) {
                cur_frm.set_value('language', new_language);
                cur_frm.refresh_field('language');
            }
            // Neuer Rahmenauftrag: Templates übernehmen
            if(cur_frm.doc.__islocal) {
                if (!cur_frm.doc.taxes_and_charges && customer.taxes_and_charges) {
                    cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
                }
                if(!cur_frm.doc.payment_terms && customer.payment_terms){
                    cur_frm.set_value('payment_terms', customer.payment_terms);
                }
            }
        }
    });
}