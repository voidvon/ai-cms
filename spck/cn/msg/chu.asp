<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/safe.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../login.asp';</SCRIPT>" 
	response.end
end if
 
'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 	if trim(ins)="07" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
 id=request.QueryString("id")
 Sql="Select * from  benming_ch_Msg  where id="&id
 Set Rs=Server.CreateObject("ADODB.RecordSet")
 Rs.open Sql,Conn,1,3
 	Rs("state")=1
 	Rs("statedate")=date()
	Rs.update
 Rs.close
 Set Rs=nothing
 Response.Redirect("Msg.asp")
%>