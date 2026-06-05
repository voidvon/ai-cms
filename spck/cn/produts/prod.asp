<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<!--#include file="../../../inc/filesystem.asp"-->
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
 	if trim(ins)="06" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../err.asp"
 	response.end
 end if
 '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^End
if request.QueryString("action")="del" then
	if not isempty(request("selAnnounce")) then
		newsidlist=request("selAnnounce")
		if instr(newsidlist,",")>0 then
			dim newsidarr
			newsidArr=split(newsidlist)
			dim log_newsid
			for i = 0 to ubound(newsidarr)
				log_newsid=clng(newsidarr(i))
				call deleteannounce(log_newsid)
			next
		else
			call deleteannounce(clng(newsidlist))
		end if
	end if
end if
 %>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css> 
<SCRIPT language=javascript1.2 src="../../css/iXs_Main.js"></SCRIPT>
<script>
var checkflag="false";
function check(field){
if(checkflag=="false"){
for(i=0;i<field.length;i++){
field[i].checked=true;}
checkflag="true";
return "解除全选"; }
else {
for(i=0;i<field.length;i++) {
field[i].checked=false;}
checkflag="false";
return "选择全部";}}
</script>


<style type="text/css">
<!--
.STYLE1 {color: #FF0000}
-->
</style>
<table width="98%" border="0" cellspacing="0" cellpadding="0" align=center class="tableBorder"> 
  <tr> 
     <th height=25 colspan="2" class="tableHeaderText">产品图片</th> 
  </tr> 
  <tr> 
     <td colspan="2" class="forumRowHighlight"><p><B>注意</B>：<BR> 
         ①产品图片直接与发布的信息相关联，删除类别可能会影响到以前发布的产品信息。<BR> </td> 
  </tr> 
  
  <tr>
    <td width="19%" height=25 class="forumRowHighlight">&nbsp;</td>
	 <td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理类别</a> | <a href="prodcat_add.asp">添加类别</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table>


<Form name="search" method="POST" action="prod.asp?action=del">
  <table wnewsidth="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
    <tr>
      <th class="tableHeaderText" height=25 colspan="8">产品图片列表</th>
    <tr>
      <td colspan="8">      </td>
    </tr>
    <tr height=25 class=bodytitle>
      <td width="43" align="left" class=bodytitle wnewsidth="446">ID</td>
      <td width="325" align="left" class=bodytitle wnewsidth="446"><font color="ff6600"><b>产品名称</b></font></td>
      <td width="131" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>产品型号</b></font></td>
      <td width="111" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>所属分类</b></font></td>
      <td width="82" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>产品属性</b></font></td>
      <td width="62" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>排序</b></font></td>
      <td width="59" align="center" class=bodytitle wnewsidth="113"><font color="ff6600"><b>修改</b></font></td>
      <td width="100" align="center" class=bodytitle wnewsidth="57"><input name="submit2" type='submit' value='删除'></td>
    </tr>
    <%
	Sql="Select * from benming_ch_prod order by orderid asc"
	set Rs=server.CreateObject("ADODB.Recordset")
	Rs.open Sql,conn,1,1
	msg_per_page=50
	%>
	<!--#include file="../../../inc/Headpage.asp"-->
	<%
	
	j=1
	do while not rs.eof and rowcount > 0
 
	%>
    <tr height="20">
      <td align="left" class=forumRow><%=Rs("id")%></td>
      	<td align="left" class=forumRow><%
	Response.write Rs("prodName")
	%>
          <%

	if Rs("tjhome")=1 then
	%>
          <img src="../../images/thanx.gif" alt="此条产品已设置首页页推荐,点击修改可重新设置推荐属性！" width="19" height="19" align="absmiddle" />
          <%end if%>
          <img src="../../images/haveimg.gif" alt="此条信息为图片标题：&lt;br&gt;&lt;img src=<%=Rs("smallpic")%> border=1 width=220 height=150&gt;" width="12" height="12" border="0" /> </td>
      	<td align="center" class=forumRow wnewsidth="113"><%=Rs("prodCode")%></td>
      	<td align="center" class=forumRow wnewsidth="113"><%=GetCatName(Rs("catid"))%></td>
      	<td width="82" align="center" class="forumRow ">
	  <%
		if Rs("show")=0 then response.write "<span class='STYLE1'>隐藏</span>"
		if Rs("show")=1 then Response.write "显示"
		%></td>
      	<td width="62" align="center" class="forumRow "><%=Rs("orderid")%></td>
      	<td align="center" class=forumRow wnewsidth="113"><a href="prod_edit.asp?id=<%=Rs("id")%>">修改</a></td>
      	<td wnewsidth="57" align="center" class=forumRow><input type='checkbox' name='selAnnounce' value='<%=Rs("id")%>'></td>
    </tr>
	 <%
		rowcount=rowcount-1
		rs.movenext
		j=j+1
	loop

	%> 
	<tr height="20" bgcolor="#ffffff">
      <td colspan="2" align="right"  class=forumRow>&nbsp;</td>
      <td colspan="5" align="right"  class=forumRow>&nbsp;</td>
      <td  class=forumRow align="right"><div align="center">
        <input name="button" type=button onClick="this.value=check(this.form)" value=" 全部选定 ">
      </div></td>
	</tr>
    <tr height="20" bgcolor="#ffffff">
      <td class=forumrowHighLight align="center" colspan="8"><%=listPages("prod.asp")%></td>
    </tr>
  </table>
</form>
  <%
  	Rs.close
	Set Rs=nothing
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^分类名称
	Function GetCatName(id)
  		Sql="Select CatName From benming_ch_ProdCat where id="&id
		Set Rstype=Server.CreateObject("ADODB.RecordSet")
		Rstype.open Sql,Conn,1,1
		if Rstype.eof=False and Rstype.bof=False then
			GetCatName=Rstype("CatName")
		else
			GetCatName=""
		end if
		Rstype.close
		Set Rstype=nothing
  	End function
  
  '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^删除产品图片
	sub deleteannounce(id)
		dim rs,sql, RsInfo
		Set RsINfo=Conn.Execute("Select * From benming_ch_prod Where id="&id&" ")
		if NOt RsINfo.Eof Then
			ttid=RsINfo("id")
			Picture=RsInfo("smallpic")
			bigpic=RsInfo("bigpic")
			FileName=Picture
			FileName1=bigpic
			if FileName<>"" then
				Call FileDel(FileName) '删除图片文件
				Call FileDel(FileName1)
			end if
			
		End if
		RsInFo.Close
		Set RsInfo=NOthing
		set rs=server.createobject("adodb.recordset")
		sql="delete from [benming_ch_prod] where id="&cstr(id)
		conn.execute sql
		if err.Number<>0 then
			err.clear
			response.write "删 除 失 败 !<br>"
		end if
End sub
  
  Conn.close
  Set Conn=nothing
  %>