frappe.ui.form.on('Sales Invoice', {
    before_save(frm) {
	    fetch_templates_from_customer(frm);
	    apply_revenue_accounts(frm);
	},
    customer(frm) {
        setTimeout(function(){
            fetch_templates_from_customer(frm);
        }, 1000);
    },
    validate(frm) {
	    if(!frm.doc.is_return) {
    		basic_sales_validations(frm);
	    }
        reload_contacts(frm);
    },
    refresh(frm) {
        if(frm.is_new()==1 && cur_frm.doc.customer){
            check_mail_contact(frm);
        }
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
        if (cur_frm.doc.docstatus == 1 && cur_frm.doc.status != 'Paid') {
            frm.add_custom_button(__("Create auto Payment"), function() {
                create_auto_payment(frm);
            });
        }
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
        attach_pdf_print(frm);
    },
    after_cancel(frm) {
        add_cancelled_watermark(frm);
    }
});

function create_auto_payment(frm) {
    frappe.call({
        "method": "senstech.scripts.sales_invoice_tools.create_payment",
        "args": {
            "sinv": cur_frm.doc.name
        },
        "callback": function(response) {
            var response = response.message;
            if (response.includes("PE-")) {
                cur_frm.reload_doc();
            } else {
                frappe.msgprint(response, "Error");
            }
        }
    });
}

function check_mail_contact(frm) {
    frappe.call({
        method:"frappe.client.get_list",
        args:{
            doctype:"Dynamic Link",
            filters: [
                ["parenttype","=",'Contact'],
                ["link_doctype","=","Customer"],
                ["link_name","=", cur_frm.doc.customer]
            ],
            fields: ["parent"],
            parent: "Contact"
        },
        callback: function(response) {
            var contact_list = [];
            if (response.message.length > 0) {
                for (var i=0; i < response.message.length; i++) {
                    contact_list.push(response.message[i].parent);
                }
                frappe.call({
                    method:"frappe.client.get_list",
                    args:{
                        doctype:"Contact",
                        filters: [
                            ["funktion","=",'E-Mail-Rechnungsempfänger'],
                            ["name","IN", contact_list]
                        ],
                        fields: ["name"]
                    },
                    callback: function(r) {
                        if (r.message.length > 0) {
                            var email_contact_list = [];
                            for (var i=0; i < r.message.length; i++) {
                                email_contact_list.push(r.message[i].name);
                            }
                            var check_contact = email_contact_list.includes(cur_frm.doc.contact_person);
                            if (!check_contact) {
                                if (email_contact_list.length == 1) {
                                    // Änderung im Formular statt im Dok. vornehmen, dann lädt es
                                    // automatisch den Kontakt und aktualisiert das Contact Display etc.
                                    cur_frm.set_value('contact_person',email_contact_list[0])
                                    //frm.doc.contact_person = email_contact_list[0]
                                    frappe.show_alert({message: "Kontakt auf E-Mail-Rechnungsempfänger '"+ email_contact_list[0]+"' gesetzt.", indicator: 'green'}, 5);
                                } else {
                                    frappe.msgprint('Dieser Kunde hat mehrere "E-Mail-Rechnungsempfänger"-Kontakte (' + email_contact_list + ').<br>Bitte manuell den passenden Kontakt zuweisen.', '"E-Mail-Rechnungsempfänger"-Kontakt');
                                }
                            }
                        }
                    }
                });
            }
        }
    });
}


function fetch_templates_from_customer(frm) {
    if(!cur_frm.doc.customer) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": "Customer",
            "name": cur_frm.doc.customer
        },
        "callback": function(response) {
            var customer = response.message;

            if (!cur_frm.doc.taxes_and_charges && customer.taxes_and_charges) {
                cur_frm.set_value('taxes_and_charges', customer.taxes_and_charges);
            }
            if(!cur_frm.doc.payment_terms_template && customer.payment_terms){
                cur_frm.set_value('payment_terms_template', customer.payment_terms);
            }
        }
    });
}

frappe.ui.form.on('Sales Invoice Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});


function apply_revenue_accounts(frm) {
    // Ertragskonten je nach Land sowie Intracompany-Status des Kunden anpassen
    if(!frm.doc.customer) {
        return;
    }
    var items = frm.doc.items;
    items.forEach(function (item) {
        if (item.income_account.startsWith("3000")) {
            // Nettoertrag
        	if (frm.doc.customer === "CU-00228") {		// IST
                item.income_account = "3002 - Nettoertrag IC IST - ST";
    	        ic_account_alert(item.position);
            } else if (frm.doc.customer === "CU-00205") {	// E+H
                item.income_account = "3003 - Nettoertrag IC E+H - ST";
    	        ic_account_alert(item.position);
        	} else if (frm.doc.territory != "Schweiz") {
        	    item.income_account = "3001 - Nettoertrag Ausland - ST";
        	}
     } else if (item.income_account.startsWith("3400")) {
         // Dienstleistungsertrag
    	if (frm.doc.customer === "CU-00228") {		// IST
            item.income_account = "3410 - Dienstleistungsertrag IC IST - ST";
    	    ic_account_alert(item.position);
        } else if (frm.doc.customer === "CU-00205") {	// E+H
            item.income_account = "3411 - Dienstleistungsertrag IC E+H - ST";
    	    ic_account_alert(item.position);
    	} else if (frm.doc.territory != "Schweiz") {
    	    item.income_account = "3401 - Dienstleistungsertrag Ausland - ST";
    	}
     }
   });
}

function ic_account_alert(pos){
    frappe.show_alert({message: 'Pos. '+pos+': Intracompany Ertragskonto gesetzt', indicator: 'green'}, 5);
}
