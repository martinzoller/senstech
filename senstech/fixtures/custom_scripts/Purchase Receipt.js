frappe.ui.form.on('Purchase Receipt', {
    before_save(frm) {
		if (!frm.doc.taxes_and_charges) {
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
		basic_purchasing_validations(frm);
    },
    supplier(frm) {
        if (!frm.doc.taxes_and_charges) {
            setTimeout(function(){
                fetch_taxes_and_charges_from_supplier(frm);
            }, 1000);
        }
    }
});