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
 	if trim(ins)="05" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 	response.redirect "../../err.asp"
 		response.end
 end if
 %>
<html>
<head>
<meta http-equiv='Content-Type' content='text/html; charset=gb2312'>
<title>栏目选择</title>
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<script src="../../prototype.js" type="text/javascript">
</script>
</body>
<style type="text/css">
<!--
body {
	background-color: #86C1FF;
}
-->
</style>
<script language="javascript">
function LoadSuns(id)
{
   whichEl = eval("submenu" + sid);
	if (whichEl.style.display == "none")
	{
		eval("submenu" + sid + ".style.display=\"\";");
	}
	else
	{
		eval("submenu" + sid + ".style.display=\"none\";");
	}
}

function showHide(objname)
{
   if($(objname).style.display=="none") $(objname).style.display = "block";
   else $(objname).style.display="none";
   return false;
}

function ReSel(ctid,cname){
	if($('selid'+ctid).checked){
		window.opener.document.form.typeid.value=ctid;
		window.opener.document.form.selbt1.value=cname;
	  if(document.all) window.opener=true;
    window.close();
	}
}
</script>

 <DIV style="PADDING-TOP: 10px"></DIV>
<table width="98%" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr>
    <td height="26" background="../../images/mtbg1.gif">&nbsp;　√请在要选择的栏目打勾</td>
  </tr>
  <tr>
    <td bgcolor="#EEFAFE">
	<%
	Sql="select * from benming_ch_ProdCat where root=0 order by orderid "
	set Rs=server.Createobject("ADODB.RecordSet")
	Rs.open Sql,Conn,1,1
	i=0
	do while not rs.eof
		i=i+1
	%>
	<table width="95%" border="0" align="center" cellpadding="0" cellspacing="0">
      <tr>
        <td width="4%" height="20"><img src="../../images/tree_explode.gif" width="11" height="11" onClick="new Element.toggle('submenu<%=i%>')" style='cursor:hand'></td>
        <td width="96%"><%=rs("CatName")%>
		<% if rs("attribute")=1 then response.Write "[频道封面]"
			if rs("attribute")=2 then response.Write "<input type='checkbox' name='selid' id='selid"&rs("id")&"' onClick=""ReSel("&rs("id")&",'"&rs("CatName")&"')"">"
		
		
		%> </td>
      </tr>
      <tr>
        <td colspan="2" style="display:none" id="submenu<%=i%>">
		
		<% call subfl(rs("id"),"&nbsp;&nbsp;")%>
		
		</td>
      </tr>
    </table>
	<%
		Rs.movenext
	loop
	%>
	</td>
  </tr>
</table>
</html>
<%
'定义子级分类
sub subfl(id,strk)
	dim rs1
	set rs1=conn.execute("Select * from benming_ch_ProdCat where root="&id&" order by orderid")
	if not rs1.eof then
		do while not rs1.eof
			response.write "<table width=""96%"" height=""20"" border=""0"" align=""center"" cellpadding=""0"" cellspacing=""0"">"
			response.write "<tr>"
            response.write "<td align=""left"">"&strk&"<img src=""../../images/tree_list.gif"" width=""12"" height=""13"">"
            response.write "&nbsp;"&rs1("CatName")
            response.write "<input type='checkbox' name='selid' id='selid"&rs1("id")&"' onClick=""ReSel("&rs1("id")&",'"&rs1("CatName")&"')"">"
          	response.write "</td></tr>"
		  	response.write "</table>"
			
			call subfl(rs1("id"),strk&"&nbsp;&nbsp;&nbsp;") '递归子级分类
			rs1.movenext
			if rs1.eof then
				rs1.close
				exit sub
			end if
		loop
	end if
end sub

%>