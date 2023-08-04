frappe.ui.form.on('Project', {
	copy_of_project_type(frm) {
		frm.set_value('project_type', frm.doc.copy_of_project_type);
	},
	
	project_type(frm) {
	    if (frm.doc.__islocal && frm.doc.project_type) {
		    get_next_project_id(frm);
		}
	},
	
	validate(frm) {
		frm.set_value('project_type', frm.doc.copy_of_project_type);
		
		let valid_prefix = {'Intern': 'IP', 'Extern': 'CP'}
		if(! new RegExp(`^${valid_prefix[frm.doc.project_type]}-[0-9]{5}$`).test(frm.doc.project_name)) {
			validation_error(frm, 'project_name', __("Die Projektnummer muss dem Schema IP-##### (intern) bzw. CP-##### (extern) entsprechen."))
		}
	}
})


function get_next_project_id(frm) {
	frappe.call({
    	'method': 'senstech.scripts.project_tools.get_next_project_id',
		'args': {
    		'project_type': frm.doc.project_type
    	},		
    	'callback': function(response) {
            var next_id = response.message;
            if (next_id) {
                frm.set_value('project_name', next_id);
            }
        }
    });
}