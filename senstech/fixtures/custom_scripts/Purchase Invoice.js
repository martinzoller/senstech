frappe.ui.form.on('Purchase Invoice', {
    before_save(frm) {
		if (!frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_supplier(frm);
		}
		apply_expense_accounts(frm);
	},
	before_submit(frm) {
		// LSV-Zahlungen nie in den Zahlungsvorschlag nehmen
		if(frm.doc.payment_type == 'LSV') {
			frm.set_value('is_proposed', 1);
		}		
	},
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    validate(frm) {
		basic_purchasing_validations(frm);
    },
    refresh(frm) {
        if ((frm.doc.docstatus === 0) && (!frm.doc.is_proposed)) {
            frm.add_custom_button(__("nicht in Zahlvorschlag"), function() {
                frm.set_value("is_proposed", 1);
            });
        }
		payment_type_changed(frm);
    },
    supplier(frm) {
        if (!frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_supplier(frm);
            }, 1000);
        }
		payment_type_changed(frm);
    },
	payment_type(frm) {
		payment_type_changed(frm);
	}
});

frappe.ui.form.on('Purchase Invoice Item', {
	items_add: function(frm, cdt, cdn) {
		set_position_number(frm, cdt, cdn);
   }
});


function apply_expense_accounts(frm) {
    // Aufwandkonten je nach Intracompany-Status des Lieferanten anpassen
    if(!frm.doc.supplier) {
        return;
    }
    let items = frm.doc.items;
    items.forEach(function (item) {
        if (item.expense_account) {
            if (item.expense_account.startsWith("4000")) {
                // Aufwand für Material
            	if (frm.doc.supplier === "SU-00248") {		// IST
                    item.expense_account = "4010 - Warenaufwand IC IST - ST"; 
                    exp_changed_alert(item.position);
                } else if (frm.doc.supplier === "SU-00219") {	// E+H
                    // derzeit kein Konto Warenaufwand E+H
            	}
            } else if (item.expense_account.startsWith("4400")) {
                 // Dienstleistungsaufwand
            	if (frm.doc.supplier === "SU-00248") {		// IST
                    item.expense_account = "4401 - Aufwand für bezogene Dienstleistungen IC IST - ST"; 
                    exp_changed_alert(item.position);
                } else if (frm.doc.supplier === "SU-00219") {	// E+H
                    item.expense_account = "4402 - Aufwand für bezogene Dienstleistungen IC E+H - ST"; 
                    exp_changed_alert(item.position);
            	}
            }
        }
   });
}

function exp_changed_alert(pos){
    frappe.show_alert({message: 'Pos. '+pos+': Intracompany Ertragskonto gesetzt', indicator: 'green'}, 5);
}

function payment_type_changed(frm) {
	if (frm.doc.payment_type === "LSV") {
		locals.iban = "LSV"; // Prevent validation error (empty IBAN) when LSV is selected
	}	
}