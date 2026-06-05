
<%

 	const database_type=0   '============================数据库连接对象的建立=========================================== 
	dim acc_db
	 
	if database_type=1 then
		
		
	else
		acc_db="database/!!@spck@##.asa"
		acc_db=data_path&acc_db                   'data_path为路径
		connstr="provider=microsoft.jet.oledb.4.0;data source=" & server.mappath(""&acc_db&"")
	end if
	

	set conn = server.createobject("adodb.connection")
	conn.commandtimeout=20
	conn.open connstr
	
	if err.number>0 then
		err.clear
		set conn = nothing
		response.write "<br><br><br><br><br><br><br><div align='center'>数据库连接出错!请检查连接数据库的参数及字符串设置是否正确！</div>"
		response.end
	end if
	
 '============================================================================================	



'----------------------------------获取网站的全局配置信息---------------------------------------------------------
 filesys="scripting.filesystemobject"
 fy_in=1
'-----------------------------------------------------------------------------------------------------



 

%>

