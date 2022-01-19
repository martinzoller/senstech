frappe.ui.form.on('Senstech Messdaten', {
	refresh(frm) {
			frm.add_custom_button(__("Flaggenetikett drucken"), function() {
				flag_label(cur_frm.doc);
			});
	}
})

function flag_label(data_doc) {
	frappe.call({
    	'method': 'senstech.scripts.tools.direct_print_doc',
    	'args': {
			'doctype': 'Senstech Messdaten',
    		'name': data_doc.name,
			'print_format': 'Sensor Flag Label ST',
			'printer_name': 'Zebra Flag Labels'
    	},
		'callback': function(response) {
		}
    });
}