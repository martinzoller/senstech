frappe.ui.form.on('Address', {

    onload_post_render(frm) {
        // Feld "Steuerkategorie" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="tax_category"]').hide();
    },
    
    before_save(frm) {
        // Bug Workaround: Linktitel korrekt setzen
        var fix_doctypes = { Customer: 'customer_name', Supplier: 'bezeichnung'};
        var links = frm.doc.links;
    	if (links) {
		    links.forEach(function(entry) {
		        if(Object.keys(fix_doctypes).includes(entry.link_doctype) && entry.link_name != '') {
		            frappe.db.get_doc(entry.link_doctype,entry.link_name).then(function(linkdoc) {
		                var titlefield = fix_doctypes[entry.link_doctype];
		                frappe.model.set_value(entry.doctype, entry.name, 'link_title', linkdoc[titlefield]);
		                console.log('Fixed link title: '+linkdoc[titlefield]);
		            });
		        }
		    });
    	}
    },
    
	pincode: function(frm) {
        if (frm.doc.pincode) {
	        get_city_from_pincode(frm.doc.pincode, 'city');
        }
	}
});
