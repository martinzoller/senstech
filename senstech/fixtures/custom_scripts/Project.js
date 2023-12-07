frappe.ui.form.on('Project', {
	onload(frm) {
		frm.fields_dict.mountain_name.$wrapper.find("div[data-fieldname=random_mountain_btn]").remove();
		frappe.ui.form.make_control({
			parent: frm.fields_dict.mountain_name.$wrapper,
			df: {
				label: __('Zufällig auswählen'),
				fieldname: 'random_mountain_btn',
				fieldtype: "Button",
				click: () => {
					random_mountain(frm);
				}
			},
			render_input: true
		});
		if(frm.doc.__islocal) {
			random_mountain(frm);
		}
	},
	
	copy_of_project_type(frm) {
		frm.set_value('project_type', frm.doc.copy_of_project_type);
		if(frm.doc.copy_of_project_type == 'Intern') {
			frm.set_value('copy_of_customer','');
			frm.set_value('customer_name', '');
		}
	},
	
	copy_of_customer(frm) {
		frm.set_value('customer', frm.doc.copy_of_customer);
	},
	
	customer(frm) {
	    get_next_project_id(frm);	
	},
	
	project_type(frm) {
	    get_next_project_id(frm);
	},
	
	mountain_name(frm) {
		set_title(frm);
	},
	
	short_description(frm) {
		set_title(frm);
	},
	
	validate(frm) {
		frm.set_value('project_type', frm.doc.copy_of_project_type);
		frm.set_value('customer', frm.doc.copy_of_customer);
		set_title(frm);
		if(! new RegExp(`^EP-[0-9]{3}-[0-9]{2}$`).test(frm.doc.project_name)) {
			validation_error(frm, 'project_name', __("Die Projektnummer muss dem Schema EP-kkk-nn entsprechen."))
		}
		if(frm.doc.project_type == 'Extern') {
			if(!frm.doc.customer || frm.doc.project_name.substr(3,3) != frm.doc.customer.substr(5,3) || frm.doc.customer.substr(3,2) != '00') {
				validation_error(frm, 'item_code', __("Die Kundennummer in der Projektnr. muss dem zugewiesenen Kunden entsprechen"));
			}
		} else {
			if(frm.doc.project_name.substr(3,3) != '011') {
				validation_error(frm, 'item_code', __("Die Kundennummer von internen Projekten muss 011 sein"));
			}
			if(frm.doc.quotation) {
				validation_error(frm, 'quotation', __("Interne Projekte dürfen nicht mit Offerten verknüpft sein"));
			}
		}
	}
});


function random_mountain(frm) {
	frappe.db.get_list("Senstech Berg", {filters: {project: ['=','']}, order_by: 'rand()', limit: 1, as_list: true}).then(f => {
		let mtn_name = f[0][0];
		frappe.db.get_list("Item", {filters: {mountain_name: ['=',mtn_name]}, limit: 1, as_list: true}).then(g => {
			if(g.length > 0) {
				// Berg ohne Projekt, aber dennoch in Artikel verwendet: Wiederholen bis "freier" Berg gefunden
				random_mountain(frm);
			} else {
				frm.set_value('mountain_name',mtn_name);
			}
		});
	});
}


function get_next_project_id(frm) {
	if(!frm.doc.__islocal || !frm.doc.project_type || (!frm.doc.customer && frm.doc.project_type == "Extern")){
		return;
	}
	
	frappe.call({
    	'method': 'senstech.scripts.project_tools.get_next_project_id',
		'args': {
    		'customer_id': frm.doc.project_type == 'Intern'?'CU-00011':frm.doc.customer
    	},		
    	'callback': function(response) {
            var next_id = response.message;
            if (next_id) {
                frm.set_value('project_name', next_id);
            }
        }
    });
}

function set_title(frm) {
	frm.set_value('project_title', (frm.doc.mountain_name || 'TBD') + ' - ' + (frm.doc.short_description || 'TBD'));
}