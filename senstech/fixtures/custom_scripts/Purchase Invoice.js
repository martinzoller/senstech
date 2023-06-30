frappe.ui.form.on('Purchase Invoice', {
    before_save(frm) {
		if (!cur_frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_supplier(frm);
		}
		apply_expense_accounts(frm);
	},
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
        // "In Worten" auch nicht
        jQuery('div[data-fieldname="base_in_words"]').hide();
    },
    validate(frm) {
		if (!frm.doc.taxes_and_charges) {
	        frappe.msgprint( __("Bitte Vorlage für Verkaufssteuern und -abgaben hinterlegen"), __("Validation") );
            frappe.validated=false;
	        frm.scroll_to_field('taxes_and_charges');
	    }
		let pos_numbers = [];
		frm.doc.items.forEach(function(entry) {
			if(!entry.description || entry.description == '<div><br></div>'){
				entry.description = entry.item_name;
			}
			if(pos_numbers.includes(entry.position)) {
					frappe.msgprint( __("Doppelte Positionsnummer:")+" "+entry.position, __("Validation") );
					frappe.validated=false;
			}
			else if(entry.position == 0) {
					frappe.msgprint( __("Positionsnummern müssen grösser Null sein"), __("Validation") );
					frappe.validated=false;
			}
			else {
				pos_numbers.push(entry.position);
			}
		});
    },
    refresh(frm) {
        if ((frm.doc.docstatus === 0) && (!frm.doc.is_proposed)) {
            frm.add_custom_button(__("nicht in Zahlvorschlag"), function() {
                cur_frm.set_value("is_proposed", 1);
            });
        }
    },
    supplier(frm) {
        if (!cur_frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_supplier(frm);
            }, 1000);
        }
    }
});

frappe.ui.form.on('Purchase Invoice Item', {
	items_add: function(frm, cdt, cdn) {
      var current_item = locals[cdt][cdn];
      var all_items = cur_frm.doc.items;
      var row_qty = all_items.length;
      if (row_qty == current_item.idx) {
          var new_pos = 10;
          if (current_item.idx != 1) {
              var prev_idx = current_item.idx - 1;
              all_items.forEach(function(entry) {
                if (entry.idx == prev_idx) {
                    new_pos = parseInt(entry.position) + 10;
                }  
              });
          }
          frappe.model.set_value(cdt, cdn, 'position', new_pos);
      } else {
          var new_pos = 1;
          if (current_item.idx != 1) {
              var prev_idx = current_item.idx - 1;
              all_items.forEach(function(entry) {
                if (entry.idx == prev_idx) {
                    new_pos = parseInt(entry.position) + 1;
                }  
              });
          }
          frappe.model.set_value(cdt, cdn, 'position', new_pos);
      }
   }
})

function fetch_taxes_and_charges_from_supplier(frm) {
    if(!cur_frm.doc.supplier) {
        return;
    }
    frappe.call({
        "method": "frappe.client.get",
        "args": {
            "doctype": "Supplier",
            "name": cur_frm.doc.supplier
        },
        "callback": function(response) {
            var supplier = response.message;

            if (supplier.taxes_and_charges) {
                cur_frm.set_value('taxes_and_charges', supplier.taxes_and_charges);
            }
        }
    });
}

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