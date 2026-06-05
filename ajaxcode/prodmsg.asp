<% data_path="../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../conn/conn.asp"-->
<!--#include file="../inc/safe.asp"-->
<%
action=request.QueryString("action")

strname=Replace_Text(request.Form("name"))
phone=Replace_Text(request.Form("phone"))
title=Replace_Text(request.Form("title"))
prodid=Replace_Text(request.Form("prodid"))
content=Replace_Text(request.Form("content"))

if title="" then
	response.End()
end if
if phone="" then
	response.End()
end if
if strname="" then
	response.End()
end if

if action="add" then
	Sql="Select * from benming_ch_Msg"
	Set Rs=Server.CreateObject("ADODB.RecordSet")
	Rs.open Sql,Conn,1,3
	Rs.addnew
		Rs("linkren")=strname
		Rs("phone")=phone
		Rs("Title")=title
		Rs("content")=content
		Rs("prodid")=prodid
		Rs("date")=Date()
	Rs.update
	Rs.close
	Set Rs=nothing
	response.write "true"
elseif action="msgadd" then
	address=Replace_Text(request.Form("address"))
	mobile=Replace_Text(request.Form("mobile"))
	fax=Replace_Text(request.Form("fax"))
	email=Replace_Text(request.Form("email"))
	
	Sql="Select * from benming_ch_Msg"
	Set Rs=Server.CreateObject("ADODB.RecordSet")
	Rs.open Sql,Conn,1,3
	Rs.addnew
		Rs("linkren")=strname
		Rs("phone")=phone
		Rs("Title")=title
		Rs("content")=content
		Rs("prodid")=0
		Rs("date")=Date()
		
		Rs("address")=address
		Rs("mobile")=mobile
		Rs("fax")=fax
		Rs("email")=email
	Rs.update
	Rs.close
	Set Rs=nothing
	response.write "true"
end if
conn.close
Set conn=nothing
%>