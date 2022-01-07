frappe.ui.form.on('Purchase Receipt', {
    before_save(frm) {
		if (!cur_frm.doc.taxes_and_charges) {
		    fetch_taxes_and_charges_from_supplier(frm);
		}
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
    },
    supplier(frm) {
        if (!cur_frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_supplier(frm);
            }, 1000);
        }
    }
});

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
