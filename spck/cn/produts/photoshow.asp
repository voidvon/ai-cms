<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
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
 	if trim(ins)="06" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 	response.redirect "../../err.asp"
 		response.end
 end if
%>
<script language="javascript">
<!--
	function select(image1,i){
		var image2 = image1
		parent.document.form['magicfacepic('+i+')'].value=image2;
		parent.lookmagic(i)
	}
//-->
</script><style type="text/css">
<!--
body,td,th {
	font-size: 12px;
	color: #333333;
}
a {
	font-size: 12px;
}
a:link {
	color: #003366;
}
a:visited {
	color: #003366;
}
a:hover {
	color: #FF3300;
}
body {
	margin-left: 0px;
	margin-top: 0px;
	margin-right: 0px;
	margin-bottom: 0px;
}
-->
</style>
<table width="100%" border="1" bordercolor="#E6E6E6" align=center cellpadding="3" cellspacing="0" bgcolor="#FFFFFF">
<tr>
<% dim sql,rs,listnum,page,i,j,filename,n,filetype,fileurl
sql="select * from benming_ch_prodphoto"
set rs=server.createobject("adodb.recordset")                     
rs.open sql,Conn,1,1                     
if rs.eof and rs.bof then                     
	response.write "<tr><td   colspan=6 align=center>暂无内容，请到<A  href=""javascript:win=window.open('myfiles.asp','contact','left=100,top=100,width=650,height=500,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no');win.focus();"">我的公文包</A>&nbsp;&nbsp;里添加&nbsp;<a href='javascript:window.location.reload();'><span style='color:red; text-decoration::none;'><strong>刷新</strong></span></a></td></tr>"
	
	
	
else  
'分页的实现 
listnum=8
Rs.pagesize=listnum
page=Request("page")
if (page-Rs.pagecount) > 0 then
page=Rs.pagecount
elseif page = "" or page < 1 then
page = 1
end if
Rs.absolutepage=page
'编号的实现
j=rs.recordcount
j=j-(page-1)*listnum
i=0
n=0
do while not rs.eof and i<listnum
n=n+1
filetype=rs("photopic")
%>
  <td align=center bgcolor="#EEEEEE" valign="top">
 
  <img src="<%=filetype%>" width=80 height=80 alt="<%=rs("photoName")%>" vspace="2" style="border:1px #000000 solid;CURSOR: hand" onClick="select('<%=rs("photopic")%>',<%=request("action")%>)"><br><%=left(rs("photoName"),10)%></td>
<%if n mod 4=0 then response.write"</tr><tr>"
rs.movenext 
i=i+1 
j=j-1
loop
if listnum*page-rs.recordcount>4 then response.write "</tr><tr><td colspan=4 height=92></td>"
if listnum*page-rs.recordcount=4 then response.write "<td colspan=4 height=92></td>"
%>
</tr>
<%filename="photoShow.asp?action="&request("action")&""%>
<tr>
  <td height="18" colspan=4 align=right bgcolor="#EEEEEE"><a href="javascript:window.location.reload();"><span style="color:red; text-decoration::none;"><strong>刷新</strong></span></a>&nbsp;&nbsp; 共 <%=Rs.pagecount%> 页 
      <% if page=1 then %>
      <%else%>
      <a href=<%=filename%>>|<<</a>
      <a href=<%=filename%>&page=<%=page-1%>><<</a>
      <a href=<%=filename%>&page=<%=page-1%>>[<%=page-1%>]</a>
<%end if
 if Rs.pagecount>1 then 
response.write "["&page&"]"
end if
%>
	  <% if Rs.pagecount-page <> 0 then %>
      <a href=<%=filename%>&page=<%=page+1%>>[<%=page+1%>]</a>
      <a href=<%=filename%>&page=<%=page+1%>>>></a>
      <a href=<%=filename%>&page=<%=Rs.pagecount%>>>>|</a>
	  <%end if%></td>
<%end if%></tr>
</table>
<%
rs.close
set rs=nothing
Conn.close
set Conn=nothing
%>