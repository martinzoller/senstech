frappe.ui.form.on('Blanket Order', {
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    },
    before_save(frm) {
        if(frm.doc.bis_auf_weiteres) {
            frm.doc.to_date = "2099-12-31";
        }
    },
    refresh(frm) {
		if (frm.doc.docstatus == 1) {
            frm.add_custom_button(__("Change To Date"), function() {
                change_to_date(frm);
            });
            // Adress-, Kontakt- und Konditionsfeld bei gebuchten R'aufträgen noch änderbar, wenn nicht gesetzt (Legacy)
			// Steuertemplate ist generell schreibgeschützt, wird jedoch ggf. automatisch gesetzt
            if(frm.doc.customer_address){
                frm.set_df_property('customer_address','read_only',1);
            }
            if(frm.doc.contact_person){
                frm.set_df_property('contact_person','read_only',1);
            }
            if(frm.doc.payment_terms){
                frm.set_df_property('payment_terms','read_only',1);
            }
            // Neue Felder in Item-Tabelle ebenfalls schreibschützen, wenn Werte gesetzt und gebucht
            if(frm.doc.items) {
                // Der Einfachheit halber nur 1. Zeile beachten
                // (Legacy Rahmenaufträge haben alle nur 1 Zeile und ohnehin kann Schreibschutz nur für ganze Tabelle gesetzt werden)
                frm.fields_dict.items.grid.toggle_enable('lot_size', frm.doc.items[0].lot_size === 0);
                frm.fields_dict.items.grid.toggle_enable('min_stock_qty', frm.doc.items[0].min_stock_qty === 0);
                frm.fields_dict.items.grid.toggle_enable('rate_custom', false);
                // Zudem Preis aus Feld "rate" in "rate_custom" übernehmen, wenn dieses noch leer ist
                frappe.model.set_value('Blanket Order Item',frm.doc.items[0].name,'rate_custom',frm.doc.items[0].rate);
                // refresh erübrigt sich, da nachher in change_customer() zwingend die items-Liste refresht wird
                //frm.fields_dict.items.grid.refresh_row(frm.doc.items[0].name);
            }
        }
        change_customer(frm);
        if (frm.doc.customer_address) {
		    update_address_display(frm, 'address_display', frm.doc.customer_address);
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
		// Steuervorlage ist hier schreibgeschützt und daher nicht als Pflichtfeld definiert
		if(!frm.doc.taxes_and_charges) {
				validation_error(frm, 'taxes_and_charges', __("Bitte im Kundenstamm eine Steuervorlage hinterlegen"));
		}
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
        {'fieldname': 'date', 'fieldtype': 'Date', 'label': __('New To Date'), 'reqd': 1, 'default': frm.doc.to_date},
        {'fieldname': 'bis_auf_weiteres', 'fieldtype': 'Check', 'label': __('Bis auf Weiteres gültig'), 'default': frm.doc.bis_auf_weiteres }
    ],
    function(values){
        frappe.call({
            "method": "senstech.scripts.blanket_order_tools.change_blanket_order_to_date",
            "args": {
                "bo": frm.doc.name,
                "date": values.date,
                "bis_auf_weiteres": values.bis_auf_weiteres
            },
            "async": false,
            "callback": function(response) {
                frm.reload_doc();
            }
        });
    },
    __('Change To Date'),
    __('Change')
    );
}


function change_customer(frm) {
    if(!frm.doc.customer) {
        frm.set_query('customer_address', () => {
          return {
            query: 'frappe.contacts.doctype.address.address.address_query',
            filters: {
            	link_doctype: 'Customer',
            	link_name: ''
            }
          };
        });
        frm.set_query('contact_person', () => {
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
    frm.set_query('customer_address', () => {
      return {
        query: 'frappe.contacts.doctype.address.address.address_query',
        filters: {
        	link_doctype: 'Customer',
        	link_name: frm.doc.customer
        }
      };
    });
    frm.set_query('contact_person', () => {
      return {
        query: 'frappe.contacts.doctype.contact.contact.contact_query',
        filters: {
        	link_doctype: 'Customer',
        	link_name: frm.doc.customer
        }
      };
    });
    frappe.db.get_doc("Customer", frm.doc.customer).then(customer => {
        if(customer) {
            var new_currency = customer.default_currency || frappe.defaults.get_global_default('currency');
            if(frm.doc.currency != new_currency){
                frm.set_value('currency', new_currency);
            }
            // Diesen Refresh in jedem Fall ausführen, da sonst teils Darstellungsprobleme auftreten (Preis z.B. "2" statt "CHF 2.00")
            frm.refresh_field('items');
            var new_language = customer.language || frappe.defaults.get_global_default('language');
            if(frm.doc.language != new_language) {
                frm.set_value('language', new_language);
                frm.refresh_field('language');
            }
            // Steuertemplate: Bis zum Buchen jeweils vom Kunden holen; bei AB-Erzeugung immer direkt von dort laden
			//                 Wenn Feld leer (Legacy-Dok.), auch im gebuchten Zustand laden
			if ((frm.doc.docstatus == 0 || !frm.doc.taxes_and_charges) && customer.taxes_and_charges) {
				frm.set_value('taxes_and_charges', customer.taxes_and_charges);
			}
			// Zahlungsbedingungen: Nur bei neuem Rahmenauftrag setzen
			if(frm.doc.__islocal && !frm.doc.payment_terms && customer.payment_terms){
				frm.set_value('payment_terms', customer.payment_terms);
			}
        }
    });
}